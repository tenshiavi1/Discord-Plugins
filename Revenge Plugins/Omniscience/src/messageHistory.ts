import { findByProps } from "../../compat";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { instead } from "@vendetta/patcher";
import { showToast } from "../../shared/toast";
import { forgetChannelMessageHistory, forgetDeletedMessage, recordMessageDelete, recordMessageUpdate } from "./chatLogger";
import { canRetainDeletedMessage, markDeletedMessage, mergeRetainedMessages, truncateEditVersion } from "./messageHistoryPresentation";

const channelMessages = findByProps("_channelMessages");
const channelStore = findByProps("getChannel");
const messageActions = findByProps("deleteMessage");
const messageStore = findByProps("getMessage", "getMessages");
const messageRecords = findByProps("createMessageRecord");
const snowflakeUtils = findByProps("extractTimestamp");
const userStore = findByProps("getCurrentUser");
const MAX_EDIT_HISTORY = 2000;
const MAX_EDIT_VERSIONS = 10;
const HISTORY_STORAGE_KEY = "omniscienceMessageHistory";

type MessageRecord = {
	id: string;
	channel_id?: string;
	content?: string;
	author?: {
		id?: string;
		username?: string;
		global_name?: string;
		discriminator?: string;
		avatar?: string;
		bot?: boolean;
	};
	attachments?: unknown[];
	embeds?: unknown[];
	flags?: number;
	[key: string]: unknown;
};

type EditRecord = {
	channelId: string;
	messageId: string;
	previous: { content: string }[];
	currentContent: string;
};

type DeletedRecord = {
	channelId: string;
	original: MessageRecord;
	retained: MessageRecord;
};

type MessageHistorySettings = {
	enabled: boolean;
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
};

const deletedMessages = new Map<string, DeletedRecord>();
const editHistory = new Map<string, EditRecord>();
const retainedViews = new Map<string, { original: unknown; revision: number; value: unknown }>();
const unpatches: (() => void)[] = [];
let dispatcherPatchInstalled = false;
let retainedRevision = 0;
let restoredHistoryAccountId: string | undefined;
let settings: MessageHistorySettings = {
	enabled: true,
	keepDeletedMessages: true,
	keepEditHistory: true,
};

function getMessageKey(channelId: string, messageId: string) {
	return `${channelId}:${messageId}`;
}

function getCurrentAccountId() {
	const id = userStore?.getCurrentUser?.()?.id;
	return typeof id === "string" && id ? id : undefined;
}

function getRetainedMessageLimit() {
	const limit = Number(storage.messageLoggerLimit);
	return [100, 500, 1000, 5000].includes(limit) ? limit : 500;
}

function getStoredMessage(channelId: string, messageId: string): MessageRecord | undefined {
	const cached = channelMessages?._channelMessages?.get?.(channelId)?.get?.(messageId);
	if (cached && typeof cached === "object") return cached as MessageRecord;
	const stored = messageStore?.getMessage?.(channelId, messageId);
	return stored && typeof stored === "object" ? stored as MessageRecord : undefined;
}

function rememberMessage<T>(map: Map<string, T>, id: string, value: T, limit: number) {
	map.delete(id);
	map.set(id, value);
	if (map.size > limit) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}

function safeJsonCopy<T>(value: T, fallback: T): T {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return fallback;
	}
}

function serializeRetainedMessage(message: MessageRecord) {
	const author = message.author;
	const timestamp = message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp;
	const editedTimestamp = message.edited_timestamp instanceof Date ? message.edited_timestamp.toISOString() : message.edited_timestamp;
	return {
		id: String(message.id),
		channel_id: String(message.channel_id ?? ""),
		content: typeof message.content === "string" ? message.content : "",
		author: author ? {
			id: author.id,
			username: author.username,
			global_name: author.global_name,
			discriminator: author.discriminator,
			avatar: author.avatar,
			bot: author.bot,
		} : undefined,
		timestamp,
		edited_timestamp: editedTimestamp,
		type: message.type,
		flags: Number(message.flags) || 0,
		state: "SENT",
		attachments: safeJsonCopy(message.attachments ?? [], []),
		embeds: safeJsonCopy(message.embeds ?? [], []),
		components: safeJsonCopy(message.components ?? [], []),
		mentions: safeJsonCopy(message.mentions ?? [], []),
		mention_roles: safeJsonCopy(message.mention_roles ?? message.mentionRoles ?? [], []),
		mentionEveryone: message.mentionEveryone,
		tts: message.tts,
		pinned: message.pinned,
	};
}

function persistMessageHistory() {
	if (!storage.messageLoggerKeepAfterRestart) {
		delete storage[HISTORY_STORAGE_KEY];
		return;
	}
	const accountId = getCurrentAccountId();
	if (!accountId) return;
	const previous = storage[HISTORY_STORAGE_KEY];
	const preserveDeleted = !settings.keepDeletedMessages && previous?.accountId === accountId
		? previous.deleted ?? []
		: undefined;
	storage[HISTORY_STORAGE_KEY] = {
		accountId,
		deleted: preserveDeleted ?? [...deletedMessages.values()].map(({ channelId, original }) => ({
			channelId,
			message: serializeRetainedMessage(original),
		})),
		edits: settings.keepEditHistory
			? [...editHistory.values()].map(({ channelId, messageId, previous: versions, currentContent }) => ({
				channelId,
				messageId,
				versions,
				currentContent,
			}))
			: [],
	};
}

function restorePersistedMessageHistory() {
	const accountId = getCurrentAccountId();
	if (!accountId || restoredHistoryAccountId === accountId) return false;
	const accountChanged = restoredHistoryAccountId !== undefined && restoredHistoryAccountId !== accountId;
	restoredHistoryAccountId = accountId;
	if (accountChanged) {
		deletedMessages.clear();
		editHistory.clear();
		invalidateRetainedViews();
	}
	const snapshot = storage[HISTORY_STORAGE_KEY];
	if (!storage.messageLoggerKeepAfterRestart || snapshot?.accountId !== accountId) return false;
	let restored = 0;
	if (settings.keepDeletedMessages && Array.isArray(snapshot.deleted)) {
		for (const entry of snapshot.deleted) {
			if (!entry || typeof entry.channelId !== "string" || !entry.message || typeof entry.message.id !== "string") continue;
			try {
				const original = messageRecords?.createMessageRecord?.(entry.message) ?? entry.message as MessageRecord;
				if (!canRetainDeletedMessage(original)) continue;
				const key = getMessageKey(entry.channelId, original.id);
				if (deletedMessages.has(key)) continue;
				rememberMessage(deletedMessages, key, {
					channelId: entry.channelId,
					original,
					retained: markDeletedMessage(original),
				}, getRetainedMessageLimit());
				restored++;
			} catch (error) {
				console.warn("[Omniscience] Could not restore a retained message.", error);
			}
		}
	}
	if (settings.keepEditHistory && Array.isArray(snapshot.edits)) {
		for (const entry of snapshot.edits.slice(-MAX_EDIT_HISTORY)) {
			if (!entry || typeof entry.channelId !== "string" || typeof entry.messageId !== "string" || !Array.isArray(entry.versions)) continue;
			const previous = entry.versions
				.filter((version: unknown): version is { content: string } => typeof version === "object" && version !== null && typeof (version as { content?: unknown }).content === "string")
				.slice(-MAX_EDIT_VERSIONS)
				.map((version: { content: string }) => ({ content: truncateEditVersion(version.content) }));
			if (!previous.length || typeof entry.currentContent !== "string") continue;
			const key = getMessageKey(entry.channelId, entry.messageId);
			if (editHistory.has(key)) continue;
			rememberMessage(editHistory, key, {
				channelId: entry.channelId,
				messageId: entry.messageId,
				previous,
				currentContent: entry.currentContent,
			}, MAX_EDIT_HISTORY);
			restored++;
		}
	}
	if (restored) {
		invalidateRetainedViews();
		try { messageStore?.emitChange?.(); } catch {}
	}
	return restored > 0;
}

function invalidateRetainedViews() {
	retainedRevision++;
	retainedViews.clear();
}

function getRetainedMessages(channelId: string) {
	return [...deletedMessages.values()]
		.filter((entry) => entry.channelId === channelId)
		.map((entry) => entry.retained);
}

function installMessageStorePatches() {
	if (typeof messageStore?.getMessages !== "function") return false;
	unpatches.push(instead("getMessages", messageStore, (args, original) => {
		const result = original(...args);
		const channelId = String(args[0] ?? "");
		if (!channelId) return result;
		const retained = getRetainedMessages(channelId);
		if (!retained.length) return result;
		const cached = retainedViews.get(channelId);
		if (cached?.original === result && cached.revision === retainedRevision) return cached.value;
		const value = mergeRetainedMessages(result, retained);
		retainedViews.set(channelId, { original: result, revision: retainedRevision, value });
		if (retainedViews.size > 16) retainedViews.delete(retainedViews.keys().next().value!);
		return value;
	}));
	if (typeof messageStore.getMessage === "function") {
		unpatches.push(instead("getMessage", messageStore, (args, original) => {
			const retained = deletedMessages.get(getMessageKey(String(args[0] ?? ""), String(args[1] ?? "")))?.retained;
			return retained ?? original(...args);
		}));
	}
	return true;
}

function dismissRetainedMessage(channelId: string, messageId: string) {
	if (!deletedMessages.delete(getMessageKey(channelId, messageId))) return false;
	invalidateRetainedViews();
	forgetDeletedMessage(channelId, messageId);
	persistMessageHistory();
	try {
		FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id: messageId, otherPluginBypass: true });
	} catch (error) {
		console.error("[Omniscience] Could not dismiss a retained message from chat.", error);
	}
	return true;
}

function installMessageActionPatch() {
	if (typeof messageActions?.deleteMessage !== "function") return;
	unpatches.push(instead("deleteMessage", messageActions, (args, original) => {
		const channelId = String(args[0] ?? "");
		const messageId = String(args[1] ?? "");
		if (settings.enabled && settings.keepDeletedMessages && dismissRetainedMessage(channelId, messageId)) {
			return Promise.resolve();
		}
		return original(...args);
	}));
}

function dispatchRetainedMessageRemovals(retained: DeletedRecord[]) {
	for (const { channelId, original } of retained) {
		try {
			FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id: original.id, otherPluginBypass: true });
		} catch (error) {
			console.error("[Omniscience] Could not remove a retained message from chat.", error);
		}
	}
}

function clearRetainedRowsFromChat() {
	const retained = [...deletedMessages.values()];
	deletedMessages.clear();
	invalidateRetainedViews();
	dispatchRetainedMessageRemovals(retained);
}

function clearLiveHistory(removeDeletedRows: boolean) {
	const retained = [...deletedMessages.values()];
	deletedMessages.clear();
	editHistory.clear();
	invalidateRetainedViews();
	if (removeDeletedRows) dispatchRetainedMessageRemovals(retained);
}

function clearChannelHistory(channelId: string) {
	let changed = false;
	for (const [key, entry] of deletedMessages) {
		if (entry.channelId === channelId) {
			deletedMessages.delete(key);
			changed = true;
		}
	}
	for (const [key, entry] of editHistory) {
		if (entry.channelId === channelId) {
			editHistory.delete(key);
			changed = true;
		}
	}
	forgetChannelMessageHistory(channelId);
	if (!changed) return;
	invalidateRetainedViews();
	persistMessageHistory();
}

function handleLifecycleEvent(event: Record<string, any>) {
	if (event.type === "LOGOUT") {
		clearLiveHistory(true);
		restoredHistoryAccountId = undefined;
		return;
	}
	if (event.type === "CONNECTION_OPEN" || event.type === "CACHE_LOADED") {
		if (restorePersistedMessageHistory()) persistMessageHistory();
		return;
	}
	if (event.type === "CHANNEL_DELETE") {
		const channelId = String(event.channel?.id ?? event.channelId ?? event.channel_id ?? event.id ?? "");
		if (channelId) clearChannelHistory(channelId);
		return;
	}
	if (event.type !== "GUILD_DELETE" || !event.guild?.id || event.guild.unavailable) return;
	const channelIds = new Set<string>();
	for (const entry of deletedMessages.values()) {
		const channel = channelStore?.getChannel?.(entry.channelId);
		if (channel?.guild_id === event.guild.id) channelIds.add(entry.channelId);
	}
	for (const entry of editHistory.values()) {
		const channel = channelStore?.getChannel?.(entry.channelId);
		if (channel?.guild_id === event.guild.id) channelIds.add(entry.channelId);
	}
	for (const channelId of channelIds) clearChannelHistory(channelId);
}

function createRetainedMessageUpdate(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const existing = deletedMessages.get(key);
	const original = existing?.original ?? getStoredMessage(channelId, messageId);
	if (!canRetainDeletedMessage(original)) return undefined;
	if (!existing) {
		rememberMessage(deletedMessages, key, { channelId, original, retained: markDeletedMessage(original) }, getRetainedMessageLimit());
		invalidateRetainedViews();
	}
	return {
		type: "MESSAGE_UPDATE",
		message: (existing ?? deletedMessages.get(key))!.retained,
		otherPluginBypass: true,
	};
}

function rememberEdit(update: any) {
	if (!settings.enabled || !settings.keepEditHistory || typeof update?.content !== "string" || !update.edited_timestamp) return;
	const channelId = String(update.channel_id ?? update.channelId ?? "");
	const messageId = String(update.id ?? "");
	if (!channelId || !messageId) return;
	const key = getMessageKey(channelId, messageId);
	const record = editHistory.get(key);
	const original = getStoredMessage(channelId, messageId);
	const previousContent = record?.currentContent ?? original?.content;
	if (typeof previousContent !== "string" || previousContent === update.content) return;
	const next: EditRecord = record ?? { channelId, messageId, previous: [], currentContent: previousContent };
	next.previous = [...next.previous, { content: truncateEditVersion(previousContent) }].slice(-MAX_EDIT_VERSIONS);
	next.currentContent = update.content;
	rememberMessage(editHistory, key, next, MAX_EDIT_HISTORY);
	persistMessageHistory();
}

function dispatchWithHistory(args: unknown[], original: (...args: any[]) => any) {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string") return original(...args);
	handleLifecycleEvent(event);
	if (event.otherPluginBypass) return original(...args);
	if (event.type === "MESSAGE_UPDATE") {
		recordMessageUpdate(event);
		rememberEdit(event.message);
		return original(...args);
	}

	if (event.type === "MESSAGE_DELETE" && settings.enabled && settings.keepDeletedMessages) {
		const channelId = String(event.channelId ?? event.channel_id ?? "");
		const messageId = String(event.id ?? "");
		if (!channelId || !messageId) return original(...args);
		recordMessageDelete({ ...event, channelId, id: messageId });
		const update = createRetainedMessageUpdate(channelId, messageId);
		if (!update) return original(...args);
		try {
			original(update);
			persistMessageHistory();
			return Promise.resolve();
		} catch (error) {
			deletedMessages.delete(getMessageKey(channelId, messageId));
			invalidateRetainedViews();
			persistMessageHistory();
			console.error("[Omniscience] Could not retain the deleted message in chat.", error);
			return original(...args);
		}
	}

	if (event.type === "MESSAGE_DELETE_BULK" && settings.enabled && settings.keepDeletedMessages && Array.isArray(event.ids)) {
		const channelId = String(event.channelId ?? event.channel_id ?? "");
		if (!channelId) return original(...args);
		const remaining: unknown[] = [];
		for (const rawId of event.ids) {
			const messageId = String(rawId ?? "");
			if (!messageId) {
				remaining.push(rawId);
				continue;
			}
			const update = createRetainedMessageUpdate(channelId, messageId);
			if (!update) {
				remaining.push(rawId);
				continue;
			}
			recordMessageDelete({ channelId, id: messageId });
			try {
				original(update);
				persistMessageHistory();
			} catch (error) {
				deletedMessages.delete(getMessageKey(channelId, messageId));
				invalidateRetainedViews();
				persistMessageHistory();
				console.error("[Omniscience] Could not retain a bulk-deleted message in chat.", error);
				remaining.push(rawId);
			}
		}
		return remaining.length ? original({ ...event, ids: remaining }) : Promise.resolve();
	}

	if (event.type === "MESSAGE_DELETE") recordMessageDelete(event);
	return original(...args);
}

export function initializeMessageHistory(pluginSettings: {
	enabled?: boolean;
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
}): boolean {
	settings = {
		enabled: pluginSettings.enabled !== false,
		keepDeletedMessages: pluginSettings.keepDeletedMessages,
		keepEditHistory: pluginSettings.keepEditHistory,
	};

	if (typeof FluxDispatcher?.dispatch !== "function") {
		console.warn("[Omniscience] Discord's message dispatcher was not found; message history is unavailable.");
		return false;
	}

	try {
		if (!installMessageStorePatches()) {
			console.warn("[Omniscience] Discord's message-list store was not found; deleted messages cannot be retained in chat.");
			return false;
		}
		installMessageActionPatch();
		restorePersistedMessageHistory();
		unpatches.push(instead("dispatch", FluxDispatcher, (args, original) => {
			try {
				return dispatchWithHistory(args, original);
			} catch (error) {
				console.error("[Omniscience] Could not update message history.", error);
				return original(...args);
			}
		}));
		dispatcherPatchInstalled = true;
		return true;
	} catch (error) {
		console.error("[Omniscience] Could not install message-history features.", error);
		return false;
	}
}

export function setMessageHistoryFeatureEnabled(enabled: boolean) {
	if (dispatcherPatchInstalled) {
		updateMessageHistorySettings({ enabled });
		return;
	}
	if (!enabled) return;
	if (!initializeMessageHistory({
		enabled,
		keepDeletedMessages: storage.keepDeletedMessages !== false,
		keepEditHistory: storage.keepEditHistory !== false,
	})) {
		removeMessageHistoryPatch();
		storage.keepDeletedMessages = false;
		storage.keepEditHistory = false;
		showToast("Could not enable Omniscience message history. Check the console for details.");
	}
}

export function updateMessageHistorySettings(patch: Partial<MessageHistorySettings>) {
	const previous = settings;
	settings = { ...settings, ...patch };
	if (!settings.enabled) {
		clearLiveHistory(true);
		restoredHistoryAccountId = undefined;
		return;
	}
	if (!settings.keepDeletedMessages && previous.keepDeletedMessages) {
		clearRetainedRowsFromChat();
	}
	if (!settings.keepEditHistory) editHistory.clear();
	if (
		(!previous.enabled && settings.enabled) ||
		(!previous.keepDeletedMessages && settings.keepDeletedMessages) ||
		(!previous.keepEditHistory && settings.keepEditHistory)
	) {
		restoredHistoryAccountId = undefined;
		restorePersistedMessageHistory();
	}
	persistMessageHistory();
}

export function setMessageHistoryPersistenceEnabled(enabled: boolean) {
	if (!enabled) {
		delete storage[HISTORY_STORAGE_KEY];
		return;
	}
	persistMessageHistory();
}

export function setMessageHistoryLimit(limit: number) {
	const validLimit = [100, 500, 1000, 5000].includes(limit) ? limit : 500;
	let changed = false;
	while (deletedMessages.size > validLimit) {
		deletedMessages.delete(deletedMessages.keys().next().value!);
		changed = true;
	}
	if (changed) {
		invalidateRetainedViews();
		try { messageStore?.emitChange?.(); } catch {}
		persistMessageHistory();
	}
}

export function getMessageEditHistory(channelId: string, messageId: string): { content: string }[] {
	return editHistory.get(getMessageKey(channelId, messageId))?.previous ?? [];
}

export function hasMessageHistory(): boolean {
	return deletedMessages.size > 0 || editHistory.size > 0;
}

export function isRetainedDeletedMessage(channelId: string, messageId: string): boolean {
	return deletedMessages.has(getMessageKey(channelId, messageId));
}

export function clearMessageHistory(removeDeletedMessagesFromChat = false) {
	if (removeDeletedMessagesFromChat) {
		for (const { channelId, original } of deletedMessages.values()) {
			try {
				FluxDispatcher.dispatch({
					type: "MESSAGE_DELETE",
					channelId,
					id: original.id,
					otherPluginBypass: true,
				});
			} catch (error) {
				console.error("[Omniscience] Could not remove a retained deleted message from chat.", error);
			}
		}
	}
	deletedMessages.clear();
	invalidateRetainedViews();
	editHistory.clear();
	delete storage[HISTORY_STORAGE_KEY];
}

export function removeMessageHistoryPatch(clearHistory = true) {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	dispatcherPatchInstalled = false;
	if (clearHistory) clearLiveHistory(true);
}
