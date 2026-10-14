import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher, React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { after, before } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

const channelMessages = findByProps("_channelMessages");
const messageStore = findByProps("getMessage", "getMessages");
const actionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
const UserStore = findByStoreName("UserStore");
const snowflakeUtils = findByProps("extractTimestamp");
const PROFILE_MENU_NAMES = ["UserProfileOverflowMenu", "BotUserProfileOverflowMenu"];
const MAX_RETAINED_MESSAGES = 500;
const MAX_EDIT_VERSIONS = 10;

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
	ignoreBotMessages: boolean;
	ignoreOwnMessages: boolean;
	ignoredUserIds: string[];
	minimalisticMode: boolean;
	useBackgroundHighlight: boolean;
	timestampForEdits: boolean;
	deletedIndicatorText: string;
	editedPrefixTag: string;
};

const deletedMessages = new Map<string, DeletedRecord>();
const editHistory = new Map<string, EditRecord>();
const unpatches: (() => void)[] = [];
let dispatcherPatchInstalled = false;
let settings: MessageHistorySettings = {
	keepDeletedMessages: true,
	keepEditHistory: true,
	ignoreBotMessages: false,
	ignoreOwnMessages: false,
	ignoredUserIds: [],
	minimalisticMode: true,
	useBackgroundHighlight: false,
	timestampForEdits: false,
	deletedIndicatorText: "This message is deleted",
	editedPrefixTag: "[ EDITED ]",
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
	return settings.ignoredUserIds.includes(author.id ?? "");
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

function withBackgroundHighlight(content: string, enabled: boolean) {
	if (!enabled) return content;
	return content.split("\n").map((line) => `> ${line}`).join("\n");
}

function retainDeletedMessage(
	event: Record<string, any>,
	channelId: string,
	messageId: string,
	original: MessageRecord,
) {
	event.type = "MESSAGE_UPDATE";
	event.channelId = original.channel_id ?? channelId;
	const indicator = settings.deletedIndicatorText.trim() || "This message is deleted";
	event.message = {
		...original,
		id: messageId,
		channel_id: original.channel_id ?? channelId,
		content: withBackgroundHighlight(indicator, settings.useBackgroundHighlight),
		was_deleted: true,
	};
	event.optimistic = false;
	event.sendMessageOptions = {};
	event.isPushNotification = false;
}

function handleDispatch(args: unknown[]) {
	const event = args[0] as Record<string, any> | undefined;
	if (!event || typeof event.type !== "string" || event.otherPluginBypass) return;

	if (event.type === "MESSAGE_DELETE" && settings.keepDeletedMessages) {
		const channelId = event.channelId;
		const messageId = event.id;
		if (typeof channelId !== "string" || typeof messageId !== "string") return;

		const key = getMessageKey(channelId, messageId);
		const existingRecord = deletedMessages.get(key);
		if (existingRecord) {
			if (shouldIgnore(existingRecord.original.author) || (Number(existingRecord.original.flags) & 64) !== 0) return;
			retainDeletedMessage(event, channelId, messageId, existingRecord.original);
			return;
		}

		const original = getStoredMessage(channelId, messageId) ?? deletedMessages.get(key)?.original;
		if (!original || shouldIgnore(original.author)) return;
		if ((Number(original.flags) & 64) !== 0) return;
		if (!original.content && !original.attachments?.length && !original.embeds?.length) return;

		rememberMessage(deletedMessages, key, { channelId, original });
		retainDeletedMessage(event, channelId, messageId, original);
		return;
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

	const prefix = settings.editedPrefixTag.trim() || "[ EDITED ]";
	const originalContent = record.previous[0]?.content ?? record.currentContent;
	const originalTimestamp = settings.timestampForEdits
		? ` (${getRelativeTimestamp(record.previous[0]?.editedAt)})`
		: "";
	const currentTimestamp = settings.timestampForEdits
		? ` (${getRelativeTimestamp(record.currentEditedAt)})`
		: "";
	const displayContent = settings.minimalisticMode
		? `${originalContent}${originalTimestamp} ${prefix} ${message.content}${currentTimestamp}`
		: `${originalContent}${originalTimestamp}\n${prefix}\n${message.content}${currentTimestamp}`;
	event.message = {
		...original,
		...message,
		content: displayContent,
		was_edited: true,
	};
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
	const icon = getAssetIDByName(iconName);
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
		showToast("Deleted-message log removed", getAssetIDByName("TrashIcon"));
	} catch (error) {
		rememberMessage(deletedMessages, key, record);
		console.error("[Sage Eyes] Could not remove the deleted-message log.", error);
		showToast("Could not remove deleted-message log");
	}
}

function removeEditHistory(channelId: string, messageId: string) {
	const key = getMessageKey(channelId, messageId);
	const record = editHistory.get(key);
	if (!record) return;

	const message = getStoredMessage(channelId, messageId);
	if (!message) {
		showToast("Original message is no longer available");
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
		showToast("Edit history removed", getAssetIDByName("ic_edit_24px"));
	} catch (error) {
		rememberMessage(editHistory, key, record);
		console.error("[Sage Eyes] Could not remove edit history.", error);
		showToast("Could not remove edit history");
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
	for (const name of PROFILE_MENU_NAMES) {
		const module = findByName(name, false);
		if (!module) continue;
		unpatches.push(after("default", module, (args, result) => {
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
					showToast(isIgnored ? "User removed from Sage Eyes ignore list" : "User ignored by Sage Eyes");
				},
			});
			return result;
		}));
	}
}

export function initializeMessageHistory(pluginSettings: {
	keepDeletedMessages: boolean;
	keepEditHistory: boolean;
	ignoreBotMessages?: boolean;
	ignoreOwnMessages?: boolean;
	ignoredUserIds?: unknown;
	minimalisticMode?: boolean;
	useBackgroundHighlight?: boolean;
	timestampForEdits?: boolean;
	deletedIndicatorText?: string;
	editedPrefixTag?: string;
}): boolean {
	settings = {
		keepDeletedMessages: pluginSettings.keepDeletedMessages,
		keepEditHistory: pluginSettings.keepEditHistory,
		ignoreBotMessages: Boolean(pluginSettings.ignoreBotMessages),
		ignoreOwnMessages: Boolean(pluginSettings.ignoreOwnMessages),
		ignoredUserIds: Array.isArray(pluginSettings.ignoredUserIds)
			? pluginSettings.ignoredUserIds.filter((id): id is string => typeof id === "string")
			: [],
		minimalisticMode: pluginSettings.minimalisticMode ?? true,
		useBackgroundHighlight: pluginSettings.useBackgroundHighlight ?? false,
		timestampForEdits: pluginSettings.timestampForEdits ?? false,
		deletedIndicatorText: pluginSettings.deletedIndicatorText ?? "This message is deleted",
		editedPrefixTag: pluginSettings.editedPrefixTag ?? "[ EDITED ]",
	};

	if (typeof FluxDispatcher?.dispatch !== "function") {
		console.warn("[Sage Eyes] Discord's message dispatcher was not found; message history is unavailable.");
		return false;
	}

	try {
		unpatches.push(before("dispatch", FluxDispatcher, (args) => {
			try {
				handleDispatch(args);
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
	settings = { ...settings, ...patch };
}

export function clearMessageHistory() {
	deletedMessages.clear();
	editHistory.clear();
}

export function removeMessageHistoryPatch() {
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	dispatcherPatchInstalled = false;
	clearMessageHistory();
}

export function isMessageHistoryPatchInstalled() {
	return dispatcherPatchInstalled;
}
