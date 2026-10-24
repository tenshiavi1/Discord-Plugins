import { findByName, findByProps } from "../../compat";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { after, before, instead } from "@vendetta/patcher";
import { showToast } from "../../shared/toast";
import {
	appendEditHistoryVersion,
	canRetainDeletedMessage,
	createDeletedMessageUpdate,
	getMessageFromChannelStore,
	getMessageUpdateDetails,
	isEphemeralMessage,
	markDeletedMessage,
	MAX_EDIT_VERSIONS,
	toPlainMessageRecord,
	truncateEditVersion,
	type EditHistoryVersion,
} from "./messageHistoryPresentation";

const channelMessages = findByProps("_channelMessages");
const messageActions = findByProps("deleteMessage");
const messageStore = findByProps("getMessage", "getMessages");
const messageRecordUtils = findByProps("createMessageRecord", "updateMessageRecord");
const MessageRecord = findByName("MessageRecord", false);
const channelStore = findByProps("getChannel");
const userStore = findByProps("getCurrentUser");
const nativeDispatch = typeof FluxDispatcher?.dispatch === "function"
	? FluxDispatcher.dispatch.bind(FluxDispatcher)
	: undefined;

const HISTORY_STORAGE_KEY = "omniscienceMessageHistory";
const HISTORY_RUNTIME_KEY = "__omniscienceVenusMessageHistory";
const MAX_DELETED_MESSAGES = 5000;
const MAX_EDITED_MESSAGES = 2000;
const MESSAGE_HISTORY_LIMITS = [100, 512, 1000, MAX_DELETED_MESSAGES];

type MessageRecord = {
	id: string;
	channel_id?: string;
	content?: string;
	author?: Record<string, unknown>;
	flags?: number;
	state?: string;
	[key: string]: any;
};

type DeletedEntry = {
	channelId: string;
	id: string;
	message: MessageRecord;
};

type EditEntry = {
	channelId: string;
	id: string;
	versions: EditHistoryVersion[];
};

type PersistedHistory = {
	accountId: string;
	deleted: { channelId: string; message: Record<string, unknown> }[];
	edits: {
		channelId: string;
		messageId?: string;
		id?: string;
		previous?: EditHistoryVersion[];
		versions?: EditHistoryVersion[];
		currentContent?: string;
	}[];
};

type HistoryRuntime = {
	deleted: Map<string, DeletedEntry>;
	deletedByChannel: Map<string, Map<string, DeletedEntry>>;
	edits: Map<string, EditEntry>;
	accountId?: string;
	restoredAccountId?: string;
};

type HistorySettings = {
	enabled: boolean;
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
};

const globalHistory = globalThis as typeof globalThis & {
	[HISTORY_RUNTIME_KEY]?: HistoryRuntime;
};
const runtime: HistoryRuntime = globalHistory[HISTORY_RUNTIME_KEY] ??= {
	deleted: new Map(),
	deletedByChannel: new Map(),
	edits: new Map(),
} as HistoryRuntime;
runtime.deleted ??= new Map();
runtime.deletedByChannel ??= new Map();
runtime.edits ??= new Map();

const deleted = runtime.deleted;
const deletedByChannel = runtime.deletedByChannel;
const edits = runtime.edits;
const unpatches: (() => void)[] = [];
let settings: HistorySettings = {
	enabled: true,
	keepDeletedMessages: true,
	keepEditHistory: true,
};
let dispatcherPatchInstalled = false;
let persistenceTimer: ReturnType<typeof setTimeout> | undefined;

function messageKey(channelId: string, messageId: string) {
	return `${channelId}:${messageId}`;
}

function currentAccountId() {
	const id = userStore?.getCurrentUser?.()?.id;
	return typeof id === "string" && id ? id : undefined;
}

function getMessageLimit() {
	const limit = Number(storage.messageLoggerLimit);
	return MESSAGE_HISTORY_LIMITS.includes(limit) ? limit : 512;
}

function getStoreMessage(channelId: string, messageId: string): MessageRecord | undefined {
	try {
		const cached = getMessageFromChannelStore(channelMessages, channelId, messageId);
		if (cached && typeof cached === "object") return cached as MessageRecord;
		const message = messageStore?.getMessage?.(channelId, messageId);
		return message && typeof message === "object" ? message as MessageRecord : undefined;
	} catch (error) {
		console.warn("[Omniscience] Could not read a message from Discord's store.", error);
		return undefined;
	}
}

function toPlainMessage(message: any): MessageRecord | undefined {
	const value = toPlainMessageRecord(message);
	return value as MessageRecord | undefined;
}

function remember<T>(map: Map<string, T>, key: string, value: T, limit: number) {
	map.delete(key);
	map.set(key, value);
	if (map.size > limit) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}

function addDeleted(entry: DeletedEntry) {
	const key = messageKey(entry.channelId, entry.id);
	deleted.set(key, entry);
	let channel = deletedByChannel.get(entry.channelId);
	if (!channel) deletedByChannel.set(entry.channelId, channel = new Map());
	channel.set(key, entry);
}

function removeDeleted(key: string) {
	const entry = deleted.get(key);
	if (!entry) return undefined;
	deleted.delete(key);
	const channel = deletedByChannel.get(entry.channelId);
	channel?.delete(key);
	if (channel?.size === 0) deletedByChannel.delete(entry.channelId);
	return entry;
}

function copyJson<T>(value: T, label: string): T | undefined {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch (error) {
		console.warn(`[Omniscience] Could not save ${label}.`, error);
		return undefined;
	}
}

function serializeMessage(message: MessageRecord) {
	const author = message.author;
	const timestamp = message.timestamp instanceof Date
		? message.timestamp.toISOString()
		: message.timestamp;
	const editedTimestamp = message.edited_timestamp instanceof Date
		? message.edited_timestamp.toISOString()
		: message.edited_timestamp;
	return {
		id: String(message.id),
		channel_id: String(message.channel_id ?? ""),
		content: typeof message.content === "string" ? message.content : "",
		author: author ? copyJson(author, "a deleted message author") : undefined,
		timestamp,
		edited_timestamp: editedTimestamp,
		type: message.type ?? 0,
		flags: Number(message.flags) || 0,
		state: "SENT",
		attachments: copyJson(message.attachments ?? [], "deleted message attachments") ?? [],
		embeds: copyJson(message.embeds ?? [], "deleted message embeds") ?? [],
		components: copyJson(message.components ?? [], "deleted message components") ?? [],
		mentions: copyJson(message.mentions ?? [], "deleted message mentions") ?? [],
		mention_roles: copyJson(message.mention_roles ?? message.mentionRoles ?? [], "deleted message role mentions") ?? [],
		mentionEveryone: message.mentionEveryone,
		tts: message.tts,
		pinned: message.pinned,
		__omniscienceDeleted: true,
	};
}

function writeHistory() {
	persistenceTimer = undefined;
	storage.messageLoggerDeletedCount = deleted.size;
	storage.messageLoggerEditCount = edits.size;
	if (!storage.messageLoggerKeepAfterRestart) return;
	const accountId = runtime.accountId ?? currentAccountId();
	if (!accountId || (runtime.accountId && runtime.accountId !== accountId)) return;

	const snapshot: PersistedHistory = {
		accountId,
		deleted: [...deleted.values()].flatMap(({ channelId, message }) => {
			const serialized = serializeMessage(message);
			return serialized.author ? [{ channelId, message: serialized }] : [];
		}),
		edits: [...edits.values()].map(({ channelId, id, versions }) => ({
			channelId,
			messageId: id,
			previous: versions,
		})),
	};
	try {
		storage[HISTORY_STORAGE_KEY] = snapshot;
	} catch (error) {
		console.error("[Omniscience] Could not save message history.", error);
	}
}

function persistHistory() {
	storage.messageLoggerDeletedCount = deleted.size;
	storage.messageLoggerEditCount = edits.size;
	if (!storage.messageLoggerKeepAfterRestart || persistenceTimer !== undefined) return;
	persistenceTimer = setTimeout(writeHistory, 750);
}

function flushHistory() {
	if (persistenceTimer === undefined) return;
	clearTimeout(persistenceTimer);
	writeHistory();
}

function restoreHistory(accountId = currentAccountId()) {
	if (!accountId || runtime.restoredAccountId === accountId) return false;
	runtime.restoredAccountId = accountId;
	const snapshot = storage[HISTORY_STORAGE_KEY] as PersistedHistory | undefined;
	if (
		!settings.enabled ||
		!storage.messageLoggerKeepAfterRestart ||
		snapshot?.accountId !== accountId
	) return false;

	let restored = false;
	for (const entry of settings.keepDeletedMessages && Array.isArray(snapshot.deleted) ? snapshot.deleted : []) {
		if (
			!entry ||
			typeof entry.channelId !== "string" ||
			!entry.message ||
			typeof entry.message.id !== "string"
		) continue;
		try {
			const original = messageRecordUtils?.createMessageRecord?.({
				...entry.message,
				__omniscienceDeleted: true,
			}) ?? entry.message as MessageRecord;
			if (!canRetainDeletedMessage(original)) continue;
			const key = messageKey(entry.channelId, original.id);
			if (deleted.has(key) || deleted.size >= getMessageLimit()) continue;
			const message = markDeletedMessage(original);
			addDeleted({
				channelId: entry.channelId,
				id: original.id,
				message,
			});
			if (!getStoreMessage(entry.channelId, original.id) && nativeDispatch) {
				nativeDispatch({
					type: "MESSAGE_CREATE",
					message: { ...serializeMessage(message), __omniscienceDeleted: true },
					otherPluginBypass: true,
				});
			}
			restored = true;
		} catch (error) {
			console.warn("[Omniscience] Could not restore a retained message.", error);
		}
	}

	if (settings.keepEditHistory && Array.isArray(snapshot.edits)) {
		for (const entry of snapshot.edits.slice(-MAX_EDITED_MESSAGES)) {
			const channelId = entry?.channelId;
			const id = entry?.messageId ?? entry?.id;
			const sourceVersions = entry?.previous ?? entry?.versions;
			if (typeof channelId !== "string" || typeof id !== "string" || !Array.isArray(sourceVersions)) continue;
			const versions = sourceVersions
				.filter((version: unknown): version is EditHistoryVersion =>
					typeof version === "object" && version !== null && typeof (version as EditHistoryVersion).content === "string")
				.slice(-MAX_EDIT_VERSIONS)
				.map((version: EditHistoryVersion) => ({
					content: truncateEditVersion(version.content),
					...(typeof version.timestamp === "string" ? { timestamp: version.timestamp } : {}),
				}));
			const key = messageKey(channelId, id);
			if (!versions.length || edits.has(key)) continue;
			remember(edits, key, { channelId, id, versions }, MAX_EDITED_MESSAGES);
			restored = true;
		}
	}

	if (restored) {
		notifyMessageStore();
	}
	persistHistory();
	return restored;
}

function notifyMessageStore() {
	try {
		messageStore?.emitChange?.();
	} catch (error) {
		console.warn("[Omniscience] Could not refresh Discord's message list.", error);
	}
}

function dispatchRemovals(entries: readonly DeletedEntry[]) {
	if (!nativeDispatch || !entries.length) return;
	const byChannel = new Map<string, string[]>();
	for (const entry of entries) {
		const ids = byChannel.get(entry.channelId);
		if (ids) ids.push(entry.id);
		else byChannel.set(entry.channelId, [entry.id]);
	}
	for (const [channelId, ids] of byChannel) {
		nativeDispatch(ids.length === 1
			? { type: "MESSAGE_DELETE", channelId, id: ids[0], otherPluginBypass: true }
			: { type: "MESSAGE_DELETE_BULK", channelId, ids, otherPluginBypass: true });
	}
}

function clearActiveDeletedMessages() {
	const entries = [...deleted.values()];
	deleted.clear();
	deletedByChannel.clear();
	storage.messageLoggerDeletedCount = 0;
	dispatchRemovals(entries);
}

function trimDeletedMessages(limit = getMessageLimit()) {
	const removed: DeletedEntry[] = [];
	while (deleted.size > limit) {
		const oldest = deleted.keys().next().value;
		if (oldest === undefined) break;
		const entry = removeDeleted(oldest);
		if (entry) removed.push(entry);
	}
	if (!removed.length) return;
	persistHistory();
	dispatchRemovals(removed);
}

function rememberDeletedMessage(channelId: string, messageId: string, source: any) {
	const message = toPlainMessage(source);
	if (!message || message.id !== messageId) return undefined;
	message.channel_id ??= channelId;
	const update = createDeletedMessageUpdate(message);
	if (!update || message.channel_id !== channelId) return undefined;

	const key = messageKey(channelId, messageId);
	const existing = deleted.get(key);
	if (existing) return update;
	while (deleted.size >= getMessageLimit()) {
		const oldest = deleted.keys().next().value;
		if (oldest === undefined) break;
		const removed = removeDeleted(oldest);
		if (!removed) continue;
		try {
			dispatchRemovals([removed]);
		} catch (error) {
			addDeleted(removed);
			console.error("[Omniscience] Could not enforce the deleted-message retention limit.", error);
			return undefined;
		}
	}
	const markedMessage = markDeletedMessage(message);
	addDeleted({ channelId, id: messageId, message: markedMessage });
	persistHistory();
	return update;
}

function rememberEdit(update: any) {
	const { message, channelId, messageId, editedTimestamp } = getMessageUpdateDetails(update);
	if (
		!settings.enabled ||
		!settings.keepEditHistory ||
		!message ||
		typeof message.content !== "string" ||
		!editedTimestamp ||
		!channelId ||
		!messageId ||
		message.__omniscienceDeleted ||
		isEphemeralMessage(message)
	) return;

	const current = toPlainMessage(getStoreMessage(channelId, messageId));
	if (!current || isEphemeralMessage(current) || typeof current.content !== "string" || current.content === message.content) return;

	const key = messageKey(channelId, messageId);
	const existing = edits.get(key);
	const timestamp = current.editedTimestamp ?? current.edited_timestamp ?? current.timestamp;
	const previous = appendEditHistoryVersion(
		existing?.versions ?? [],
		current.content,
		message.content,
		timestamp instanceof Date
			? timestamp.toISOString()
			: typeof timestamp === "string" ? timestamp : undefined,
	);
	if (!previous) return;
	remember(edits, key, {
		channelId,
		id: messageId,
		versions: previous,
	}, MAX_EDITED_MESSAGES);
	persistHistory();
}

function forgetChannel(channelId: string) {
	const bucket = deletedByChannel.get(channelId);
	if (bucket) for (const key of bucket.keys()) removeDeleted(key);
	let changed = Boolean(bucket);
	for (const [key, entry] of edits) {
		if (entry.channelId !== channelId) continue;
		edits.delete(key);
		changed = true;
	}
	if (changed) {
		persistHistory();
	}
}

function forgetGuild(guildId: string) {
	if (typeof channelStore?.getChannel !== "function") return;
	const channelIds = new Set<string>();
	for (const channelId of deletedByChannel.keys()) {
		try {
			if (channelStore.getChannel(channelId)?.guild_id === guildId) channelIds.add(channelId);
		} catch (error) {
			console.warn("[Omniscience] Could not resolve a channel while leaving a server.", error);
			return;
		}
	}
	for (const entry of edits.values()) {
		try {
			if (channelStore.getChannel(entry.channelId)?.guild_id === guildId) channelIds.add(entry.channelId);
		} catch (error) {
			console.warn("[Omniscience] Could not resolve a channel while leaving a server.", error);
			return;
		}
	}
	for (const channelId of channelIds) forgetChannel(channelId);
}

function handleDispatchBefore(args: any[]) {
	const event = args[0];
	if (!event || typeof event.type !== "string" || event.otherPluginBypass) return args;

	if (event.type === "LOGOUT") {
		flushHistory();
		deleted.clear();
		deletedByChannel.clear();
		edits.clear();
		runtime.accountId = undefined;
		runtime.restoredAccountId = undefined;
		persistHistory();
		return args;
	}

	if (event.type === "CONNECTION_OPEN" || event.type === "CACHE_LOADED") {
		const incomingAccountId = typeof event.user?.id === "string" ? event.user.id : currentAccountId();
		if (incomingAccountId && runtime.accountId && incomingAccountId !== runtime.accountId) {
			flushHistory();
			deleted.clear();
			deletedByChannel.clear();
			edits.clear();
			runtime.restoredAccountId = undefined;
		}
		if (incomingAccountId) runtime.accountId = incomingAccountId;
		Promise.resolve().then(() => restoreHistory(incomingAccountId));
		return args;
	}

	if (event.type === "CHANNEL_DELETE") {
		const channelId = String(event.channel?.id ?? event.channelId ?? event.id ?? "");
		if (channelId) forgetChannel(channelId);
		return args;
	}

	if (event.type === "GUILD_DELETE" && event.guild?.id && !event.guild.unavailable) {
		forgetGuild(String(event.guild.id));
		return args;
	}

	if (event.type === "MESSAGE_UPDATE") {
		rememberEdit(event);
		return args;
	}

	if (!settings.enabled || !settings.keepDeletedMessages) return args;
	if (event.type === "MESSAGE_DELETE") {
		const channelId = String(event.channelId ?? event.channel_id ?? "");
		const id = String(event.id ?? "");
		if (!channelId || !id) return args;
		const update = rememberDeletedMessage(channelId, id, getStoreMessage(channelId, id));
		return update ? [update, ...args.slice(1)] : args;
	}

	if (event.type === "MESSAGE_DELETE_BULK" && Array.isArray(event.ids)) {
		const channelId = String(event.channelId ?? event.channel_id ?? "");
		if (!channelId) return args;
		const remaining: unknown[] = [];
		for (const rawId of event.ids) {
			const id = String(rawId ?? "");
			if (!id) {
				remaining.push(rawId);
				continue;
			}
			const update = rememberDeletedMessage(channelId, id, getStoreMessage(channelId, id));
			if (!update) {
				remaining.push(rawId);
				continue;
			}
			if (nativeDispatch) {
				try {
					nativeDispatch({ ...update, otherPluginBypass: true });
				} catch (error) {
					removeDeleted(messageKey(channelId, id));
					console.error("[Omniscience] Could not retain a bulk-deleted message.", error);
					remaining.push(rawId);
				}
			} else {
				removeDeleted(messageKey(channelId, id));
				remaining.push(rawId);
			}
		}
		return [{ ...event, ids: remaining }, ...args.slice(1)];
	}

	return args;
}

function installDeleteActionPatch() {
	if (typeof messageActions?.deleteMessage !== "function") return false;
	try {
		unpatches.push(instead("deleteMessage", messageActions, (args, original) => {
			const channelId = String(args[0] ?? "");
			const messageId = String(args[1] ?? "");
			const key = messageKey(channelId, messageId);
			const entry = settings.enabled && settings.keepDeletedMessages ? removeDeleted(key) : undefined;
			if (!entry) return original(...args);

			if (!deletedByChannel.get(channelId)?.size) deletedByChannel.delete(channelId);
			persistHistory();
			try {
				if (!nativeDispatch) throw new Error("Discord's native message dispatcher is unavailable.");
				nativeDispatch({ type: "MESSAGE_DELETE", channelId, id: messageId, otherPluginBypass: true });
			} catch (error) {
				addDeleted(entry);
				persistHistory();
				console.error("[Omniscience] Could not remove a retained message from chat.", error);
				throw error;
			}
			return Promise.resolve();
		}));
		return true;
	} catch (error) {
		console.error("[Omniscience] Could not patch Discord's delete action.", error);
		return false;
	}
}

function installMessageRecordPatches() {
	if (!messageRecordUtils || typeof messageRecordUtils.createMessageRecord !== "function") {
		console.warn("[Omniscience] Discord's message record factory was not found; deleted message markers may not survive store updates.");
	}
	if (typeof messageRecordUtils?.createMessageRecord === "function") {
		try {
			unpatches.push(after("createMessageRecord", messageRecordUtils, (args: any[], record: any) => {
				if (!args[0]?.__omniscienceDeleted || !record) return;
				record.__omniscienceDeleted = true;
			}));
		} catch (error) {
			console.warn("[Omniscience] Could not preserve deleted-message markers during record creation.", error);
		}
	}
	if (typeof messageRecordUtils?.updateMessageRecord === "function") {
		try {
			unpatches.push(instead("updateMessageRecord", messageRecordUtils, (args: any[], original: (...args: any[]) => any) => {
				const oldRecord = args[0];
				const nextRecord = args[1];
				if (!nextRecord?.__omniscienceDeleted && !oldRecord?.__omniscienceDeleted) return original(...args);
				const raw = toPlainMessage(nextRecord);
				if (!raw || typeof messageRecordUtils.createMessageRecord !== "function") return original(...args);
				raw.__omniscienceDeleted = true;
				return messageRecordUtils.createMessageRecord(raw, oldRecord?.reactions);
			}));
		} catch (error) {
			console.warn("[Omniscience] Could not preserve deleted-message markers during record updates.", error);
		}
	}
	if (typeof MessageRecord === "function") {
		try {
			unpatches.push(after("default", MessageRecord, (args: any[], record: any) => {
				if (args[0]?.__omniscienceDeleted && record) record.__omniscienceDeleted = true;
			}));
		} catch (error) {
			console.warn("[Omniscience] Could not preserve deleted-message markers in MessageRecord.", error);
		}
	}
}

function installDispatcherPatch() {
	if (typeof FluxDispatcher?.dispatch !== "function") return false;
	try {
		unpatches.push(before("dispatch", FluxDispatcher, handleDispatchBefore));
		dispatcherPatchInstalled = true;
		return true;
	} catch (error) {
		console.error("[Omniscience] Could not patch Discord's message dispatcher.", error);
		return false;
	}
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

	if (dispatcherPatchInstalled) return true;
	if (!installDeleteActionPatch()) console.warn("[Omniscience] Discord's delete action was not found; retained messages cannot be dismissed from chat.");
	installMessageRecordPatches();
	if (!installDispatcherPatch()) {
		for (const unpatch of unpatches.splice(0).reverse()) unpatch();
		console.warn("[Omniscience] Discord's message dispatcher was not found; message history is unavailable.");
		return false;
	}

	const accountId = currentAccountId();
	if (accountId) runtime.accountId = accountId;
	if (settings.enabled) restoreHistory(accountId);
	else {
		flushHistory();
		edits.clear();
		clearActiveDeletedMessages();
		storage.messageLoggerEditCount = 0;
		runtime.restoredAccountId = undefined;
	}
	return true;
}

export function setMessageHistoryFeatureEnabled(enabled: boolean) {
	if (!dispatcherPatchInstalled) {
		if (!enabled && !settings.keepDeletedMessages && !settings.keepEditHistory) return;
		initializeMessageHistory({
			enabled,
			keepDeletedMessages: storage.keepDeletedMessages !== false,
			keepEditHistory: storage.keepEditHistory !== false,
		});
		if (enabled && !dispatcherPatchInstalled) {
			showToast("Could not enable message history. Check the console for details.");
		}
		return;
	}
	if (settings.enabled && !enabled) {
		flushHistory();
		edits.clear();
		clearActiveDeletedMessages();
		storage.messageLoggerEditCount = 0;
		runtime.restoredAccountId = undefined;
	}
	settings.enabled = enabled;
	if (enabled) {
		runtime.restoredAccountId = undefined;
		restoreHistory();
	}
	notifyMessageStore();
}

export function updateMessageHistorySettings(patch: Partial<HistorySettings>) {
	const previous = settings;
	settings = { ...settings, ...patch };
	const clearedEditHistory = previous.keepEditHistory && !settings.keepEditHistory;
	const clearedDeletedMessages = previous.keepDeletedMessages && !settings.keepDeletedMessages;
	if (clearedDeletedMessages) flushHistory();
	if (clearedEditHistory) edits.clear();
	if (clearedDeletedMessages) {
		clearActiveDeletedMessages();
		runtime.restoredAccountId = undefined;
	}
	if (
		(!previous.keepEditHistory && settings.keepEditHistory) ||
		(!previous.keepDeletedMessages && settings.keepDeletedMessages)
	) {
		runtime.restoredAccountId = undefined;
		restoreHistory();
	}
	if (clearedEditHistory) {
		persistHistory();
		flushHistory();
	} else if (!clearedDeletedMessages) persistHistory();
	if (
		previous.enabled !== settings.enabled ||
		previous.keepDeletedMessages !== settings.keepDeletedMessages ||
		previous.keepEditHistory !== settings.keepEditHistory
	) notifyMessageStore();
}

export function setMessageHistoryPersistenceEnabled(enabled: boolean) {
	storage.messageLoggerKeepAfterRestart = enabled;
	if (enabled) persistHistory();
	else {
		if (persistenceTimer !== undefined) clearTimeout(persistenceTimer);
		persistenceTimer = undefined;
		delete storage[HISTORY_STORAGE_KEY];
	}
}

export function setMessageHistoryLimit(limit: number) {
	storage.messageLoggerLimit = MESSAGE_HISTORY_LIMITS.includes(limit) ? limit : 512;
	trimDeletedMessages(getMessageLimit());
}

export function clearMessageHistory(removeDeletedMessagesFromChat = true) {
	const removed = [...deleted.values()];
	deleted.clear();
	deletedByChannel.clear();
	edits.clear();
	if (persistenceTimer !== undefined) clearTimeout(persistenceTimer);
	persistenceTimer = undefined;
	delete storage[HISTORY_STORAGE_KEY];
	storage.messageLoggerDeletedCount = 0;
	storage.messageLoggerEditCount = 0;
	if (removeDeletedMessagesFromChat) dispatchRemovals(removed);
	notifyMessageStore();
}

export function hasMessageHistory() {
	return deleted.size > 0 || edits.size > 0;
}

export function getMessageEditHistory(channelId: string, messageId: string) {
	return edits.get(messageKey(channelId, messageId))?.versions ?? [];
}

export function getMessageEditCount() {
	return edits.size;
}

export function setEditHistoryEnabled(enabled: boolean) {
	storage.keepEditHistory = enabled;
	updateMessageHistorySettings({ keepEditHistory: enabled });
}

export function isRetainedDeletedMessage(channelId: string, messageId: string) {
	return deleted.has(messageKey(channelId, messageId));
}

export function removeMessageHistoryPatch() {
	flushHistory();
	if (deleted.size && !nativeDispatch) {
		console.warn("[Omniscience] Discord's message dispatcher was not found; retained message rows could not be cleaned up.");
	}
	dispatchRemovals([...deleted.values()]);
	deleted.clear();
	deletedByChannel.clear();
	edits.clear();
	runtime.restoredAccountId = undefined;
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	dispatcherPatchInstalled = false;
}
