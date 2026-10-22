import { findByName, findByProps, findByStoreName } from "../../compat";
import { FluxDispatcher, React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";

const channelMessages = findByProps("_channelMessages");
const messageStore = findByProps("getMessage", "getMessages");
const actionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
const UserStore = findByStoreName("UserStore");
const snowflakeUtils = findByProps("extractTimestamp");
const PROFILE_MENU_NAMES = ["UserProfileOverflowMenu", "BotUserProfileOverflowMenu"];
const MAX_RETAINED_MESSAGES = 500;
const MAX_EDIT_VERSIONS = 10;
const EDIT_NOTICE_LIFETIME_MS = 8_000;
const DISCORD_EPOCH = 1_420_070_400_000n;

type MessageRecord = {
	id: string;
	channel_id?: string;
	content?: string;
	author?: { id?: string; username?: string; bot?: boolean };
	attachments?: unknown[];
	embeds?: unknown[];
	flags?: number;
	[key: string]: unknown;
};

type EditRecord = {
	previous: { content: string; editedAt?: string | null }[];
	currentContent: string;
	currentEditedAt?: string | null;
};

type DeletedRecord = {
	channelId: string;
	original: MessageRecord;
};

type MessageHistorySettings = {
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
	enableIgnoreUsers: boolean;
	ignoreBotMessages: boolean;
	ignoreOwnMessages: boolean;
	ignoredUserIds: string[];
	timestampForEdits: boolean;
	deletedIndicatorText: string;
};

const deletedMessages = new Map<string, DeletedRecord>();
const editHistory = new Map<string, EditRecord>();
const editNotices = new Map<string, { channelId: string; messageId: string; timer: ReturnType<typeof setTimeout> }>();
const editNoticeIdsByMessage = new Map<string, Set<string>>();
const unpatches: (() => void)[] = [];
const ignoredUserUnpatches: (() => void)[] = [];
let dispatcherPatchInstalled = false;
let editNoticeSequence = 0n;
let settings: MessageHistorySettings = {
	keepDeletedMessages: true,
	keepEditHistory: true,
	enableIgnoreUsers: true,
	ignoreBotMessages: false,
	ignoreOwnMessages: false,
	ignoredUserIds: [],
	timestampForEdits: false,
	deletedIndicatorText: "This message was deleted",
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

function shouldIgnore(author: MessageRecord["author"]) {
	if (!author) return false;
	if (settings.ignoreBotMessages && author.bot) return true;
	const currentUserId = UserStore?.getCurrentUser?.()?.id;
	if (settings.ignoreOwnMessages && currentUserId && author.id === currentUserId) return true;
	return settings.enableIgnoreUsers && settings.ignoredUserIds.includes(author.id ?? "");
}

function getRelativeTimestamp(value?: string | null) {
	if (!value) return "time unknown";
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return "time unknown";
	const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
	if (elapsedSeconds < 60) return "just now";
	if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
	if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)}h ago`;
	return `${Math.floor(elapsedSeconds / 86400)}d ago`;
}

function getMessageTimestamp(message: MessageRecord) {
	if (typeof message.edited_timestamp === "string") return message.edited_timestamp;
	if (typeof message.id !== "string" || typeof snowflakeUtils?.extractTimestamp !== "function") return null;
	try {
		const timestamp = snowflakeUtils.extractTimestamp(message.id);
		if (timestamp instanceof Date) return timestamp.toISOString();
		if (typeof timestamp === "number" && Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
		if (typeof timestamp === "string" && Number.isFinite(Date.parse(timestamp))) return timestamp;
	} catch (error) {
		console.warn("[Sage Eyes] Could not determine a message timestamp.", error);
	}
	return null;
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
		console.error("[Sage Eyes] Could not dismiss the temporary edit notice.", error);
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
		sageEyesOriginalMessageId: messageId,
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
		console.error("[Sage Eyes] Could not show the original text edit notice.", error);
		dismissEditNotice(noticeId);
		return;
	}

	const timer = setTimeout(() => dismissEditNotice(noticeId), EDIT_NOTICE_LIFETIME_MS);
	editNotices.set(noticeId, { channelId, messageId, timer });
}

function handleDispatch(args: unknown[]): unknown[] | void {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string" || event.otherPluginBypass) return;

	if (event.type === "MESSAGE_DELETE" && settings.keepDeletedMessages) {
		const channelId = event.channelId;
		const messageId = event.id;
		if (typeof channelId !== "string" || typeof messageId !== "string") return;

		const key = getMessageKey(channelId, messageId);
		dismissEditNoticesForMessage(channelId, messageId);
		const existingRecord = deletedMessages.get(key);
		if (existingRecord) {
			if (shouldIgnore(existingRecord.original.author) || (Number(existingRecord.original.flags) & 64) !== 0) return;
			return retainMessageNotice(args, channelId, messageId, settings.deletedIndicatorText.trim() || "This message was deleted");
		}

		const original = getStoredMessage(channelId, messageId) ?? deletedMessages.get(key)?.original;
		if (!original || shouldIgnore(original.author)) return;
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
			console.error("[Sage Eyes] Could not forward the original message deletion to other listeners.", error);
		}
		return retainMessageNotice(args, channelId, messageId, settings.deletedIndicatorText.trim() || "This message was deleted");
	}

	if (event.type !== "MESSAGE_UPDATE" || !settings.keepEditHistory) return;
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
	if (!original || typeof original.content !== "string" || shouldIgnore(original.author)) return;

	if (!record) {
		record = {
			previous: [],
			currentContent: original.content,
			currentEditedAt: getMessageTimestamp(original),
		};
	}

	if (record.currentContent !== message.content) {
		record.previous = [...record.previous, {
			content: record.currentContent,
			editedAt: record.currentEditedAt,
		}].slice(-MAX_EDIT_VERSIONS);
		record.currentContent = message.content;
		record.currentEditedAt = message.edited_timestamp;
	}
	rememberMessage(editHistory, key, record);

	const timestamp = settings.timestampForEdits ? ` (${getRelativeTimestamp(record.currentEditedAt)})` : "";
	const originalContent = record.previous[0]?.content ?? original.content;
	showOriginalEditNotice(
		channelId,
		messageId,
		{ ...original, edited_timestamp: record.currentEditedAt },
		`${originalContent || "Original message"}${timestamp}`,
	);
	return args;
}

function getActionArray(tree: unknown): any[] | undefined {
	return findInReactTree(tree, (node: any) =>
		Array.isArray(node) && node.some((item) => typeof item?.props?.label === "string"),
	) as any[] | undefined;
}

function createActionRow(
	label: string,
	messageKey: string,
	subLabel: string,
	iconName: string,
	onPress: () => void,
	destructive = false,
) {
	const icon = getAssetIDByName(iconName) ?? getAssetIDByName("TrashIcon");
	const iconComponent = ActionSheetRow.Icon;
	return React.createElement(ActionSheetRow, {
		key: `sage-eyes-${label.toLowerCase().replaceAll(" ", "-")}`,
		sageEyesActionFor: messageKey,
		label,
		subLabel,
		isDestructive: destructive,
		...(icon && iconComponent ? { icon: React.createElement(iconComponent, { source: icon }) } : {}),
		onPress,
	});
}

function removeDeletedMessage(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const record = deletedMessages.get(key);
	if (!record) return;
	deletedMessages.delete(key);
	try {
		FluxDispatcher.dispatch({
			type: "MESSAGE_DELETE",
			channelId,
			id: messageId,
			otherPluginBypass: true,
		});
		actionSheet.hideActionSheet();
		showToast("Removed the deleted-message record.", getAssetIDByName("TrashIcon"));
	} catch (error) {
		rememberMessage(deletedMessages, key, record);
		console.error("[Sage Eyes] Could not remove the deleted-message log.", error);
		showToast("Could not remove the deleted-message record.");
	}
}

function removeEditHistory(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const record = editHistory.get(key);
	if (!record) return;

	const message = getStoredMessage(channelId, messageId);
	if (!message) {
		showToast("The original message is no longer available, so its edit history cannot be removed.");
		return;
	}

	try {
		editHistory.delete(key);
		FluxDispatcher.dispatch({
			type: "MESSAGE_UPDATE",
			channelId,
			message: {
				...message,
				id: messageId,
				channel_id: channelId,
				content: record.currentContent,
				edited_timestamp: null,
				was_edited: false,
			},
			otherPluginBypass: true,
		});
		actionSheet.hideActionSheet();
		showToast("Removed the message's edit history.", getAssetIDByName("ic_edit_24px"));
	} catch (error) {
		rememberMessage(editHistory, key, record);
		console.error("[Sage Eyes] Could not remove edit history.", error);
		showToast("Could not remove the message's edit history.");
	}
}

function installMessageActionSheetPatch() {
	if (!actionSheet?.openLazy || !actionSheet?.hideActionSheet || !ActionSheetRow) {
		console.warn("[Sage Eyes] Message action-sheet components were not found; message cleanup actions are unavailable.");
		return;
	}

	unpatches.push(before("openLazy", actionSheet, ([component, actionName, actionMessage]) => {
		if (actionName !== "MessageLongPressActionSheet" || !actionMessage?.message) return;
		const message = actionMessage.message as MessageRecord;
		const channelId = message.channel_id;
		const messageId = message.id;
		if (typeof channelId !== "string" || typeof messageId !== "string") return;

		const key = getMessageKey(channelId, messageId);
		const deleted = deletedMessages.has(key) || Boolean(message.was_deleted);
		const edited = editHistory.has(key) || Boolean(message.was_edited);
		if (!deleted && !edited) return;
		if (!component || typeof component.then !== "function") return;

		void component.then((module: any) => {
			const unpatch = after("default", module, (_args, rendered) => {
				React.useEffect(() => () => unpatch(), []);
				const rows = getActionArray(rendered);
				if (!rows) return rendered;
				if (rows.some((row) => row?.props?.sageEyesActionFor === key)) return rendered;

				const replyIndex = rows.findIndex((row) => row?.props?.label?.toLowerCase?.() === "reply");
				let insertIndex = replyIndex >= 0 ? replyIndex + 1 : rows.length;
				if (edited) {
					rows.splice(insertIndex++, 0, createActionRow(
						"Remove Edit History",
						key,
						"Sage Eyes · restores the current text",
						"ic_edit_24px",
						() => removeEditHistory(channelId, messageId),
					));
				}
				if (deleted) {
					rows.splice(insertIndex, 0, createActionRow(
						"Remove Deleted Message",
						key,
						"Sage Eyes · permanently removes this local log",
						"TrashIcon",
						() => removeDeletedMessage(channelId, messageId),
						true,
					));
				}
				return rendered;
			});
			return module;
		}).catch((error: unknown) => {
			console.error("[Sage Eyes] Could not open message cleanup actions.", error);
		});
	}));
}

function getProfileMenuItems(result: any): any[] | undefined {
	const items = result?.props?.items;
	if (Array.isArray(items) && Array.isArray(items[0])) return items[0];
	const childrenItems = result?.props?.children?.props?.items;
	if (Array.isArray(childrenItems) && Array.isArray(childrenItems[0])) return childrenItems[0];
	const node = findInReactTree(result, (item: any) =>
		Array.isArray(item?.props?.items) && Array.isArray(item.props.items[0]),
	) as any;
	return node?.props?.items?.[0];
}

function installIgnoredUserMenuPatches() {
	if (!settings.enableIgnoreUsers || ignoredUserUnpatches.length) return;
	for (const name of PROFILE_MENU_NAMES) {
		const module = findByName(name, false);
		if (!module) continue;
		ignoredUserUnpatches.push(after("default", module, (args, result) => {
			const userId = args[0]?.user?.id ?? args[0]?.userId;
			if (typeof userId !== "string") return result;
			const items = getProfileMenuItems(result);
			if (!items || items.some((item) => item?.sageEyesIgnoreAction)) return result;

			const isIgnored = settings.ignoredUserIds.includes(userId);
			items.push({
				label: isIgnored ? "Unignore in Sage Eyes" : "Ignore in Sage Eyes",
				sageEyesIgnoreAction: true,
				action: () => {
					settings.ignoredUserIds = isIgnored
						? settings.ignoredUserIds.filter((id) => id !== userId)
						: [...settings.ignoredUserIds, userId];
					storage.ignoredUserIds = settings.ignoredUserIds;
					updateMessageHistorySettings({ ignoredUserIds: settings.ignoredUserIds });
					showToast(isIgnored
						? "Removed this user from the Sage Eyes ignore list."
						: "Added this user to the Sage Eyes ignore list.");
				},
			});
			return result;
		}));
	}
}

export function initializeMessageHistory(pluginSettings: {
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
	enableIgnoreUsers?: boolean;
	ignoreBotMessages?: boolean;
	ignoreOwnMessages?: boolean;
	ignoredUserIds?: unknown;
	timestampForEdits?: boolean;
	deletedIndicatorText?: string;
}): boolean {
	settings = {
		keepDeletedMessages: pluginSettings.keepDeletedMessages,
		keepEditHistory: pluginSettings.keepEditHistory,
		enableIgnoreUsers: pluginSettings.enableIgnoreUsers ?? true,
		ignoreBotMessages: Boolean(pluginSettings.ignoreBotMessages),
		ignoreOwnMessages: Boolean(pluginSettings.ignoreOwnMessages),
		ignoredUserIds: Array.isArray(pluginSettings.ignoredUserIds)
			? pluginSettings.ignoredUserIds.filter((id): id is string => typeof id === "string")
			: [],
		timestampForEdits: pluginSettings.timestampForEdits ?? false,
		deletedIndicatorText: pluginSettings.deletedIndicatorText ?? "This message was deleted",
	};

	if (typeof FluxDispatcher?.dispatch !== "function") {
		console.warn("[Sage Eyes] Discord's message dispatcher was not found; message history is unavailable.");
		return false;
	}

	try {
		unpatches.push(before("dispatch", FluxDispatcher, (args) => {
			try {
				return handleDispatch(args);
			} catch (error) {
				console.error("[Sage Eyes] Could not update message history.", error);
			}
		}));
		dispatcherPatchInstalled = true;
		installMessageActionSheetPatch();
		installIgnoredUserMenuPatches();
		return true;
	} catch (error) {
		console.error("[Sage Eyes] Could not install message-history features.", error);
		return false;
	}
}

export function updateMessageHistorySettings(patch: Partial<MessageHistorySettings>) {
	const enableIgnoreUsers = patch.enableIgnoreUsers;
	settings = { ...settings, ...patch };
	if (enableIgnoreUsers === undefined || !dispatcherPatchInstalled) return;
	if (enableIgnoreUsers) {
		installIgnoredUserMenuPatches();
	} else {
		for (const unpatch of ignoredUserUnpatches.splice(0).reverse()) unpatch();
	}
}

export function clearMessageHistory() {
	deletedMessages.clear();
	editHistory.clear();
}

export function removeMessageHistoryPatch(clearHistory = true) {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	for (const unpatch of ignoredUserUnpatches.splice(0).reverse()) unpatch();
	for (const noticeId of [...editNotices.keys()]) dismissEditNotice(noticeId);
	dispatcherPatchInstalled = false;
	if (clearHistory) clearMessageHistory();
}
