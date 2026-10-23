import { findByProps } from "../../compat";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { instead } from "@vendetta/patcher";
import { showToast } from "../../shared/toast";
import { forgetDeletedMessage, recordMessageDelete, recordMessageUpdate } from "./chatLogger";
import { appendEditHistoryVersion, canRetainDeletedMessage, hasEditedTimestamp, isEphemeralMessage, isLegacyEditNotice, markDeletedMessage, mergeRetainedMessages, MAX_EDIT_VERSIONS, removeLegacyEditNotices, shouldClearHistoryForNewSession, truncateEditVersion, type EditHistoryVersion } from "./messageHistoryPresentation";

const channelMessages = findByProps("_channelMessages");
const messageActions = findByProps("deleteMessage");
const messageStore = findByProps("getMessage", "getMessages");
const messageRecords = findByProps("createMessageRecord");
const userStore = findByProps("getCurrentUser");
const MAX_EDIT_HISTORY = 2000;
const HISTORY_STORAGE_KEY = "omniscienceMessageHistory";
const HISTORY_RUNTIME_KEY = "__omniscienceMessageHistoryRuntime";

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

type DeletedRecord = {
	channelId: string;
	original: MessageRecord;
	retained: MessageRecord;
};

type EditRecord = {
	channelId: string;
	messageId: string;
	previous: EditHistoryVersion[];
	currentContent?: string;
};

type MessageHistorySettings = {
	enabled: boolean;
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
};

type HistoryRuntimeState = {
	deletedMessages: Map<string, DeletedRecord>;
	editHistory: Map<string, EditRecord>;
	sessionInitialized: boolean;
};

const globalHistoryRuntime = globalThis as typeof globalThis & { [HISTORY_RUNTIME_KEY]?: HistoryRuntimeState };
const historyRuntime = globalHistoryRuntime[HISTORY_RUNTIME_KEY] ??= {
	deletedMessages: new Map(),
	editHistory: new Map(),
	sessionInitialized: false,
};
historyRuntime.editHistory ??= new Map();
const deletedMessages = historyRuntime.deletedMessages;
const editHistory = historyRuntime.editHistory;
const retainedViews = new Map<string, { original: unknown; revision: number; value: unknown }>();
const legacyEditNoticeIds = new Set<string>();
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
	return [100, 512, 1000, 5000].includes(limit) ? limit : 512;
}

function prepareHistorySession() {
	const shouldClear = shouldClearHistoryForNewSession(historyRuntime.sessionInitialized, Boolean(storage.messageLoggerKeepAfterRestart));
	if (historyRuntime.sessionInitialized) return;
	historyRuntime.sessionInitialized = true;
	if (shouldClear) delete storage[HISTORY_STORAGE_KEY];
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
	storage.messageLoggerEditCount = editHistory.size;
	if (!storage.messageLoggerKeepAfterRestart) return;
	const accountId = getCurrentAccountId();
	if (!accountId) return;
	storage[HISTORY_STORAGE_KEY] = {
		accountId,
		deleted: [...deletedMessages.values()].map(({ channelId, original }) => ({
			channelId,
			message: serializeRetainedMessage(original),
		})),
		edits: settings.keepEditHistory
			? [...editHistory.values()].map(({ channelId, messageId, previous, currentContent }) => ({
				channelId,
				messageId,
				previous,
				currentContent,
			}))
			: [],
	};
}

function restorePersistedMessageHistory() {
	prepareHistorySession();
	const accountId = getCurrentAccountId();
	if (!accountId || restoredHistoryAccountId === accountId) return false;
	restoredHistoryAccountId = accountId;
	const snapshot = storage[HISTORY_STORAGE_KEY];
	if (!storage.messageLoggerKeepAfterRestart || snapshot?.accountId !== accountId) return false;
	let restored = 0;
	if (Array.isArray(snapshot.deleted)) {
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
			const channelId = entry?.channelId;
			const messageId = entry?.messageId ?? entry?.id;
			const rawVersions = entry?.previous ?? entry?.versions;
			if (typeof channelId !== "string" || typeof messageId !== "string" || !Array.isArray(rawVersions)) continue;
			const previous = rawVersions
				.filter((version: unknown): version is EditHistoryVersion =>
					typeof version === "object" && version !== null && typeof (version as EditHistoryVersion).content === "string")
				.slice(-MAX_EDIT_VERSIONS)
				.map((version: EditHistoryVersion) => ({
					content: truncateEditVersion(version.content),
					...(typeof version.timestamp === "string" ? { timestamp: version.timestamp } : {}),
				}));
			const currentContent = typeof entry.currentContent === "string"
				? entry.currentContent
				: getStoredMessage(channelId, messageId)?.content;
			const key = getMessageKey(channelId, messageId);
			if (!previous.length || editHistory.has(key)) continue;
			rememberMessage(editHistory, key, { channelId, messageId, previous, currentContent }, MAX_EDIT_HISTORY);
			restored++;
		}
	}
	if (restored) {
		invalidateRetainedViews();
		try { messageStore?.emitChange?.(); } catch {}
	}
	persistMessageHistory();
	return restored > 0;
}

function invalidateRetainedViews() {
	retainedRevision++;
	retainedViews.clear();
}

function getRetainedMessages(channelId: string) {
	if (!settings.enabled || !settings.keepDeletedMessages) return [];
	return [...deletedMessages.values()]
		.filter((entry) => entry.channelId === channelId)
		.map((entry) => entry.retained);
}

function installMessageStorePatches() {
	if (typeof messageStore?.getMessages !== "function") return false;
	unpatches.push(instead("getMessages", messageStore, (args, original) => {
		const result = original(...args);
		const channelId = String(args[0] ?? "");
		for (const message of Array.isArray(result) ? result : ((result as { _array?: unknown[] } | undefined)?._array ?? [])) {
			if (isLegacyEditNotice(message) && typeof (message as { id?: unknown }).id === "string") legacyEditNoticeIds.add((message as { id: string }).id);
		}
		const visible = removeLegacyEditNotices(result);
		if (!channelId) return visible;
		const retained = getRetainedMessages(channelId);
		if (!retained.length) return visible;
		const cached = retainedViews.get(channelId);
		if (cached?.original === result && cached.revision === retainedRevision) return cached.value;
		const value = mergeRetainedMessages(visible, retained);
		retainedViews.set(channelId, { original: result, revision: retainedRevision, value });
		if (retainedViews.size > 16) retainedViews.delete(retainedViews.keys().next().value!);
		return value;
	}));
	if (typeof messageStore.getMessage === "function") {
		unpatches.push(instead("getMessage", messageStore, (args, original) => {
			const retained = settings.enabled && settings.keepDeletedMessages
				? deletedMessages.get(getMessageKey(String(args[0] ?? ""), String(args[1] ?? "")))?.retained
				: undefined;
			if (retained) return retained;
			const message = original(...args);
			if (isLegacyEditNotice(message)) {
				if (typeof message.id === "string") legacyEditNoticeIds.add(message.id);
				return undefined;
			}
			return message;
		}));
	}
	return true;
}

function handleLifecycleEvent(event: Record<string, any>) {
	if (event.type === "CONNECTION_OPEN" || event.type === "CACHE_LOADED") {
		if (restorePersistedMessageHistory()) persistMessageHistory();
	}
}

function createRetainedMessageUpdate(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const existing = deletedMessages.get(key);
	const original = existing?.original ?? getStoredMessage(channelId, messageId);
	if (!original) return undefined;
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

function rememberEdit(event: any) {
	const update = event?.message ?? event;
	if (!settings.enabled || !settings.keepEditHistory || !hasEditedTimestamp(update) || isEphemeralMessage(update)) return;
	const channelId = String(update.channel_id ?? update.channelId ?? event?.channel_id ?? event?.channelId ?? "");
	const messageId = String(update.id ?? event?.id ?? "");
	if (!channelId || !messageId) return;
	const key = getMessageKey(channelId, messageId);
	const original = getStoredMessage(channelId, messageId);
	if (isEphemeralMessage(original)) return;
	const content = typeof update.content === "string" ? update.content : undefined;
	if (content === undefined) return;
	const existing = editHistory.get(key);
	const previousContent = existing?.currentContent ?? original?.content;
	if (typeof previousContent !== "string" || previousContent === content) return;
	const timestamp = original?.edited_timestamp instanceof Date
		? original.edited_timestamp.toISOString()
		: typeof original?.edited_timestamp === "string"
			? original.edited_timestamp
			: undefined;
	const previous = appendEditHistoryVersion(existing?.previous ?? [], previousContent, content, timestamp);
	if (!previous) return;
	rememberMessage(editHistory, key, { channelId, messageId, previous, currentContent: content }, MAX_EDIT_HISTORY);
	persistMessageHistory();
}

function notifyMessageStore() {
	try { messageStore?.emitChange?.(); } catch {}
}

function installDeleteActionPatch() {
	if (typeof messageActions?.deleteMessage !== "function") return false;
	unpatches.push(instead("deleteMessage", messageActions, (args, original) => {
		const channelId = String(args[0] ?? "");
		const messageId = String(args[1] ?? "");
		if (!settings.enabled || !settings.keepDeletedMessages || !channelId || !messageId) return original(...args);
		const key = getMessageKey(channelId, messageId);
		if (deletedMessages.has(key)) {
			deletedMessages.delete(key);
			forgetDeletedMessage(channelId, messageId);
			invalidateRetainedViews();
			FluxDispatcher.dispatch({ type: "MESSAGE_DELETE", channelId, id: messageId, otherPluginBypass: true });
			persistMessageHistory();
			notifyMessageStore();
			return Promise.resolve();
		}
		const originalMessage = getStoredMessage(channelId, messageId);
		if (!canRetainDeletedMessage(originalMessage)) return original(...args);
		const retained: DeletedRecord = { channelId, original: originalMessage, retained: markDeletedMessage(originalMessage) };
		rememberMessage(deletedMessages, key, retained, getRetainedMessageLimit());
		invalidateRetainedViews();
		notifyMessageStore();

		const rollback = () => {
			if (deletedMessages.get(key) !== retained) return;
			deletedMessages.delete(key);
			invalidateRetainedViews();
			notifyMessageStore();
			persistMessageHistory();
		};
		const complete = (value: any) => {
			recordMessageDelete({ channelId, id: messageId });
			persistMessageHistory();
			return value;
		};
		try {
			const result = original(...args);
			if (result && typeof result.then === "function") return Promise.resolve(result).then(complete, (error) => { rollback(); throw error; });
			return complete(result);
		} catch (error) {
			rollback();
			throw error;
		}
	}));
	return true;
}

function dispatchWithHistory(args: unknown[], original: (...args: any[]) => any) {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string") return original(...args);
	handleLifecycleEvent(event);
	if (event.type === "MESSAGE_CREATE" && isLegacyEditNotice(event.message ?? event)) {
		const notice = event.message ?? event;
		if (typeof notice.id === "string") legacyEditNoticeIds.add(notice.id);
		return Promise.resolve();
	}
	if (event.type === "MESSAGE_EDIT_FAILED_AUTOMOD") {
		const noticeId = String(event.messageData?.message?.messageId ?? "");
		if (noticeId && legacyEditNoticeIds.delete(noticeId)) {
			return Promise.resolve();
		}
	}
	if (event.otherPluginBypass) return original(...args);
	if (event.type === "MESSAGE_UPDATE") {
		recordMessageUpdate(event);
		rememberEdit(event);
		return original(...args);
	}
	if (event.type === "MESSAGE_DELETE" && (!settings.enabled || !settings.keepDeletedMessages)) {
		recordMessageDelete(event);
		return original(...args);
	}
	if (event.type === "MESSAGE_DELETE_BULK" && (!settings.enabled || !settings.keepDeletedMessages)) return original(...args);

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
		installDeleteActionPatch();
		prepareHistorySession();
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
	prepareHistorySession();
	if (dispatcherPatchInstalled) {
		updateMessageHistorySettings({ enabled });
		return;
	}
	const snapshot = storage[HISTORY_STORAGE_KEY];
	const hasSavedHistory = Boolean(
		storage.messageLoggerKeepAfterRestart &&
		snapshot?.accountId === getCurrentAccountId(),
	);
	if (!enabled && !hasSavedHistory && !deletedMessages.size && !editHistory.size) return;
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
	if (previous.keepEditHistory && !settings.keepEditHistory) {
		editHistory.clear();
	}
	if ((!previous.enabled && settings.enabled) || (!previous.keepDeletedMessages && settings.keepDeletedMessages) || (!previous.keepEditHistory && settings.keepEditHistory)) {
		restoredHistoryAccountId = undefined;
		restorePersistedMessageHistory();
	}
	persistMessageHistory();
	if (previous.enabled !== settings.enabled || previous.keepDeletedMessages !== settings.keepDeletedMessages || previous.keepEditHistory !== settings.keepEditHistory) {
		try { messageStore?.emitChange?.(); } catch {}
	}
}

export function setMessageHistoryPersistenceEnabled(enabled: boolean) {
	if (enabled) persistMessageHistory();
	else delete storage[HISTORY_STORAGE_KEY];
}

export function setMessageHistoryLimit(limit: number) {
	const validLimit = [100, 512, 1000, 5000].includes(limit) ? limit : 512;
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

export function hasMessageHistory(): boolean {
	return deletedMessages.size > 0 || editHistory.size > 0;
}

export function getMessageEditHistory(channelId: string, messageId: string): EditHistoryVersion[] {
	return editHistory.get(getMessageKey(channelId, messageId))?.previous ?? [];
}

export function getMessageEditCount() {
	return editHistory.size;
}

export function setEditHistoryEnabled(enabled: boolean) {
	storage.keepEditHistory = enabled;
	updateMessageHistorySettings({ keepEditHistory: enabled });
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
	editHistory.clear();
	invalidateRetainedViews();
	delete storage[HISTORY_STORAGE_KEY];
}

export function removeMessageHistoryPatch() {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	dispatcherPatchInstalled = false;
}
