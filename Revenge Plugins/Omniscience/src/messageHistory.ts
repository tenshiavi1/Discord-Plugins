import { findByProps } from "../../compat";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { instead } from "@vendetta/patcher";
import { showToast } from "../../shared/toast";
import { recordMessageDelete, recordMessageUpdate } from "./chatLogger";
import { canRetainDeletedMessage, markDeletedMessage, mergeRetainedMessages } from "./messageHistoryPresentation";

const channelMessages = findByProps("_channelMessages");
const messageStore = findByProps("getMessage", "getMessages");
const snowflakeUtils = findByProps("extractTimestamp");
const MAX_RETAINED_MESSAGES = 500;
const MAX_EDIT_VERSIONS = 10;
const DISCORD_EPOCH = 1_420_070_400_000n;

type MessageRecord = {
	id: string;
	channel_id?: string;
	content?: string;
	author?: { id?: string; username?: string };
	attachments?: unknown[];
	embeds?: unknown[];
	flags?: number;
	[key: string]: unknown;
};

type EditRecord = {
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
let settings: MessageHistorySettings = {
	enabled: true,
	keepDeletedMessages: true,
	keepEditHistory: true,
};

function getMessageKey(channelId: string, messageId: string) {
	return `${channelId}:${messageId}`;
}

function getStoredMessage(channelId: string, messageId: string): MessageRecord | undefined {
	const cached = channelMessages?._channelMessages?.get?.(channelId)?.get?.(messageId);
	if (cached && typeof cached === "object") return cached as MessageRecord;
	const stored = messageStore?.getMessage?.(channelId, messageId);
	return stored && typeof stored === "object" ? stored as MessageRecord : undefined;
}

function rememberMessage<T>(map: Map<string, T>, id: string, value: T) {
	map.delete(id);
	map.set(id, value);
	if (map.size > MAX_RETAINED_MESSAGES) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
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

function createRetainedMessageUpdate(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const existing = deletedMessages.get(key);
	const original = existing?.original ?? getStoredMessage(channelId, messageId);
	if (!canRetainDeletedMessage(original)) return undefined;
	if (!existing) {
		rememberMessage(deletedMessages, key, { channelId, original, retained: markDeletedMessage(original) });
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
	const next: EditRecord = record ?? { previous: [], currentContent: previousContent };
	next.previous = [...next.previous, { content: previousContent }].slice(-MAX_EDIT_VERSIONS);
	next.currentContent = update.content;
	rememberMessage(editHistory, key, next);
}

function dispatchWithHistory(args: unknown[], original: (...args: any[]) => any) {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string" || event.otherPluginBypass) return original(...args);
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
			return Promise.resolve();
		} catch (error) {
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
			} catch (error) {
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
	settings = { ...settings, ...patch };
	if (!settings.keepEditHistory) editHistory.clear();
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
}

export function removeMessageHistoryPatch(clearHistory = true) {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	dispatcherPatchInstalled = false;
	if (clearHistory) clearMessageHistory();
}
