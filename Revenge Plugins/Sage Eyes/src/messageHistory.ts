import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const channelMessages = findByProps("_channelMessages");
const messageStore = findByProps("getMessage", "getMessages");
const MAX_RETAINED_MESSAGES = 500;
const MAX_EDIT_VERSIONS = 10;

type MessageRecord = {
	id: string;
	channel_id?: string;
	content?: string;
	author?: { bot?: boolean };
	attachments?: unknown[];
	embeds?: unknown[];
	flags?: number;
	[key: string]: unknown;
};

type EditRecord = {
	previous: string[];
	lastContent: string;
};

const deletedMessages = new Map<string, MessageRecord>();
const editHistory = new Map<string, EditRecord>();
let unpatch: (() => void) | undefined;

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

function handleDispatch(args: unknown[], settings: { keepDeletedMessages: boolean; keepEditHistory: boolean }) {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string") return;

	if (event.type === "MESSAGE_DELETE" && settings.keepDeletedMessages) {
		const channelId = event.channelId;
		const messageId = event.id;
		if (typeof channelId !== "string" || typeof messageId !== "string") return;

		const original = getStoredMessage(channelId, messageId) ?? deletedMessages.get(messageId);
		if (!original || (Number(original.flags) & 64) !== 0) return;
		if (!original.content && !original.attachments?.length && !original.embeds?.length) return;

		rememberMessage(deletedMessages, messageId, original);
		event.type = "MESSAGE_UPDATE";
		event.channelId = original.channel_id ?? channelId;
		event.message = {
			...original,
			id: messageId,
			channel_id: original.channel_id ?? channelId,
			content: `[Deleted message]\n${original.content ?? ""}`,
			flags: Number(original.flags ?? 0) | 64,
			was_deleted: true,
		};
		event.optimistic = false;
		return;
	}

	if (event.type !== "MESSAGE_UPDATE" || !settings.keepEditHistory) return;
	const message = event.message;
	if (!message || typeof message.content !== "string" || !message.edited_timestamp) return;
	if (message.author?.bot) return;

	const channelId = message.channel_id ?? event.channelId;
	const messageId = message.id ?? event.id;
	if (typeof channelId !== "string" || typeof messageId !== "string") return;
	const original = getStoredMessage(channelId, messageId);
	if (!original || typeof original.content !== "string" || original.content === message.content) return;

	let record = editHistory.get(messageId);
	if (!record) {
		record = { previous: [], lastContent: original.content };
	}
	if (record.lastContent !== message.content) {
		record.previous = [...record.previous, record.lastContent].slice(-MAX_EDIT_VERSIONS);
		record.lastContent = message.content;
	}
	rememberMessage(editHistory, messageId, record);

	event.message = {
		...original,
		...message,
		content: `Previous versions:\n${record.previous.join("\n\n---\n\n")}\n\nCurrent version:\n${message.content}`,
	};
}

export function initializeMessageHistory(settings: {
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
}): boolean {
	if (unpatch) return true;
	if (typeof FluxDispatcher?.dispatch !== "function") {
		console.warn("[Sage Eyes] Discord's message dispatcher was not found; deleted-message and edit history are unavailable.");
		return false;
	}

	try {
		unpatch = before("dispatch", FluxDispatcher, (args) => {
			try {
				handleDispatch(args, settings);
			} catch (error) {
				console.error("[Sage Eyes] Could not update message history.", error);
			}
		});
		return true;
	} catch (error) {
		console.error("[Sage Eyes] Could not install message-history tracking.", error);
		return false;
	}
}

export function clearMessageHistory() {
	deletedMessages.clear();
	editHistory.clear();
}

export function removeMessageHistoryPatch() {
	unpatch?.();
	unpatch = undefined;
	clearMessageHistory();
}
