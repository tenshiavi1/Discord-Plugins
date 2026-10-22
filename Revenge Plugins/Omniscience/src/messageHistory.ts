import { findByProps } from "../../compat";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { before } from "@vendetta/patcher";
import { showToast } from "../../shared/toast";
import { recordMessageDelete, recordMessageUpdate } from "./chatLogger";

const channelMessages = findByProps("_channelMessages");
const messageStore = findByProps("getMessage", "getMessages");
const snowflakeUtils = findByProps("extractTimestamp");
const MAX_RETAINED_MESSAGES = 500;
const MAX_EDIT_VERSIONS = 10;
const EDIT_NOTICE_LIFETIME_MS = 8_000;
const DISCORD_EPOCH = 1_420_070_400_000n;
const DELETED_MESSAGE_NOTICE = "This message was deleted";

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
};

type MessageHistorySettings = {
	enabled: boolean;
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
};

const deletedMessages = new Map<string, DeletedRecord>();
const editHistory = new Map<string, EditRecord>();
const editNotices = new Map<string, { channelId: string; messageId: string; timer: ReturnType<typeof setTimeout> }>();
const editNoticeIdsByMessage = new Map<string, Set<string>>();
const unpatches: (() => void)[] = [];
let dispatcherPatchInstalled = false;
let editNoticeSequence = 0n;
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

function retainMessageNotice(args: unknown[], channelId: string, messageId: string, indicator: string) {
	args[0] = {
		type: "MESSAGE_EDIT_FAILED_AUTOMOD",
		messageData: {
			type: 1,
			message: { channelId, messageId },
		},
		errorResponseBody: {
			code: 200000,
			message: indicator,
		},
	};
	return args;
}

function createMessageNotice(channelId: string, messageId: string, indicator: string) {
	return {
		type: "MESSAGE_EDIT_FAILED_AUTOMOD",
		messageData: {
			type: 1,
			message: { channelId, messageId },
		},
		errorResponseBody: {
			code: 200000,
			message: indicator,
		},
	};
}

function createEditNoticeId() {
	editNoticeSequence = (editNoticeSequence + 1n) & 0xfffn;
	return (((BigInt(Date.now()) - DISCORD_EPOCH) << 22n) | editNoticeSequence).toString();
}

function dismissEditNotice(noticeId: string) {
	const notice = editNotices.get(noticeId);
	if (!notice) return;
	clearTimeout(notice.timer);
	editNotices.delete(noticeId);
	const originalKey = getMessageKey(notice.channelId, notice.messageId);
	const noticeIds = editNoticeIdsByMessage.get(originalKey);
	noticeIds?.delete(noticeId);
	if (noticeIds?.size === 0) editNoticeIdsByMessage.delete(originalKey);
	try {
		FluxDispatcher.dispatch({
			type: "MESSAGE_DELETE",
			channelId: notice.channelId,
			id: noticeId,
			otherPluginBypass: true,
		});
	} catch (error) {
		console.error("[Omniscience] Could not dismiss the temporary edit notice.", error);
	}
}

function dismissEditNoticesForMessage(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	for (const noticeId of [...(editNoticeIdsByMessage.get(key) ?? [])]) dismissEditNotice(noticeId);
}

function showOriginalEditNotice(channelId: string, messageId: string, original: MessageRecord, content: string) {
	dismissEditNoticesForMessage(channelId, messageId);
	const noticeId = createEditNoticeId();
	const noticeMessage = {
		...original,
		id: noticeId,
		channel_id: channelId,
		content,
		timestamp: new Date().toISOString(),
		edited_timestamp: null,
		flags: 0,
		omniscienceOriginalMessageId: messageId,
	};
	const key = getMessageKey(channelId, messageId);
	const noticeIds = editNoticeIdsByMessage.get(key) ?? new Set<string>();
	noticeIds.add(noticeId);
	editNoticeIdsByMessage.set(key, noticeIds);

	try {
		FluxDispatcher.dispatch({
			type: "MESSAGE_CREATE",
			channelId,
			message: noticeMessage,
			otherPluginBypass: true,
		});
		FluxDispatcher.dispatch(createMessageNotice(channelId, noticeId, content));
	} catch (error) {
		console.error("[Omniscience] Could not show the original text edit notice.", error);
		dismissEditNotice(noticeId);
		return;
	}

	const timer = setTimeout(() => dismissEditNotice(noticeId), EDIT_NOTICE_LIFETIME_MS);
	editNotices.set(noticeId, { channelId, messageId, timer });
}

function handleDispatch(args: unknown[]): unknown[] | void {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string" || event.otherPluginBypass) return;
	if (event.type === "MESSAGE_UPDATE") recordMessageUpdate(event);
	if (event.type === "MESSAGE_DELETE") recordMessageDelete(event);

	if (event.type === "MESSAGE_DELETE" && settings.enabled && settings.keepDeletedMessages) {
		const channelId = event.channelId;
		const messageId = event.id;
		if (typeof channelId !== "string" || typeof messageId !== "string") return;

		const key = getMessageKey(channelId, messageId);
		dismissEditNoticesForMessage(channelId, messageId);
		const existingRecord = deletedMessages.get(key);
		if (existingRecord) {
			if ((Number(existingRecord.original.flags) & 64) !== 0) return;
			return retainMessageNotice(args, channelId, messageId, DELETED_MESSAGE_NOTICE);
		}

		const original = getStoredMessage(channelId, messageId) ?? deletedMessages.get(key)?.original;
		if (!original) return;
		if ((Number(original.flags) & 64) !== 0) return;
		if (!original.content && !original.attachments?.length && !original.embeds?.length) return;

		rememberMessage(deletedMessages, key, { channelId, original });
		try {
			FluxDispatcher.dispatch({
				...event,
				type: "MESSAGE_DELETE",
				channelId,
				id: messageId,
				otherPluginBypass: true,
			});
		} catch (error) {
			console.error("[Omniscience] Could not forward the original message deletion to other listeners.", error);
		}
		return retainMessageNotice(args, channelId, messageId, DELETED_MESSAGE_NOTICE);
	}

	if (event.type !== "MESSAGE_UPDATE" || !settings.enabled || !settings.keepEditHistory) return;
	const message = event.message;
	if (!message || typeof message.content !== "string" || !message.edited_timestamp) return;

	const channelId = message.channel_id ?? event.channelId;
	const messageId = message.id ?? event.id;
	if (typeof channelId !== "string" || typeof messageId !== "string") return;
	const key = getMessageKey(channelId, messageId);
	let record = editHistory.get(key);
	const storedMessage = getStoredMessage(channelId, messageId);
	const original = record && storedMessage?.was_edited
		? { ...storedMessage, content: record.currentContent }
		: storedMessage;
	if (!original || typeof original.content !== "string") return;

	if (!record) {
		record = {
			previous: [],
			currentContent: original.content,
		};
	}

	if (record.currentContent !== message.content) {
		record.previous = [...record.previous, { content: record.currentContent }].slice(-MAX_EDIT_VERSIONS);
		record.currentContent = message.content;
	}
	rememberMessage(editHistory, key, record);

	const originalContent = record.previous[0]?.content ?? original.content;
	showOriginalEditNotice(
		channelId,
		messageId,
		original,
		originalContent || "Original message",
	);
	return args;
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
		unpatches.push(before("dispatch", FluxDispatcher, (args) => {
			try {
				return handleDispatch(args);
			} catch (error) {
				console.error("[Omniscience] Could not update message history.", error);
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
}

export function hasMessageHistory(): boolean {
	return deletedMessages.size > 0 || editHistory.size > 0;
}

export function clearMessageHistory(removeDeletedMessagesFromChat = false) {
	for (const noticeId of [...editNotices.keys()]) dismissEditNotice(noticeId);
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
}

export function removeMessageHistoryPatch(clearHistory = true) {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	for (const noticeId of [...editNotices.keys()]) dismissEditNotice(noticeId);
	dispatcherPatchInstalled = false;
	if (clearHistory) clearMessageHistory();
}
