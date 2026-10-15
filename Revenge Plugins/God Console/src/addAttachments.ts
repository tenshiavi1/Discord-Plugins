import { registerCommand } from "@vendetta/commands";
import { constants } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "../../compat";
import { showToast } from "../../shared/toast";

const STRING_OPTION = 3;
const ATTACHMENT_OPTION = 11;
const FILE_OPTION_NAMES = ["file1", "file2", "file3"] as const;
const MAX_ATTACHMENTS = 10;

let enabled = false;
let unregisterCommand: (() => void) | undefined;

function getFiles(channelId: string, args: any[], draftType: number) {
	const uploadStore = findByStoreName("UploadAttachmentStore") ?? findByProps("getUpload");
	if (typeof uploadStore?.getUpload !== "function") {
		throw new Error("Discord's attachment upload store is unavailable.");
	}

	const files = FILE_OPTION_NAMES.flatMap((name) => {
		const option = args.find((argument) => argument?.name === name && argument?.type === ATTACHMENT_OPTION);
		if (!option) return [];

		const upload = uploadStore.getUpload(channelId, name, draftType);
		const file = upload?.item?.file;
		if (!file || typeof file.name !== "string" || !Number.isFinite(Number(file.size))) {
			throw new Error(`Could not read ${name} from the command's attachment picker.`);
		}
		return [{ file, name: file.name, size: Number(file.size) }];
	});

	if (files.length === 0) throw new Error("Select at least one attachment.");
	return files;
}

function validateMessage(message: any, channel: any, currentUserId: string, permissions: any, fileCount: number) {
	if (!message || message.channel_id !== channel.id) throw new Error("Message not found in this channel.");
	if (message.author?.id !== currentUserId) throw new Error("You can only add attachments to your own messages.");
	if (![0, 19].includes(message.type)) throw new Error("Attachments can only be added to regular messages and replies.");
	if ((Number(message.flags) & 8192) !== 0) throw new Error("Voice messages are not supported.");

	const attachments = Array.isArray(message.attachments) ? message.attachments : [];
	if (attachments.length + fileCount > MAX_ATTACHMENTS) {
		throw new Error(`A message can have at most ${MAX_ATTACHMENTS} attachments.`);
	}

	const isPrivate = typeof channel.isPrivate === "function"
		? channel.isPrivate()
		: [1, 3].includes(channel.type);
	if (!isPrivate) {
		const sendMessages = constants?.Permissions?.SEND_MESSAGES;
		if (sendMessages === undefined || typeof permissions?.can !== "function") {
			throw new Error("Discord's message permission checker is unavailable.");
		}
		if (!permissions.can(sendMessages, channel)) throw new Error("You cannot send messages in this channel.");
	}
}

async function addAttachments(args: any[], context: any) {
	const channelId = context?.channel?.id;
	const messageId = args.find((argument) => argument?.name === "message_id")?.value;
	if (typeof channelId !== "string" || !/^\d{17,20}$/.test(String(messageId ?? ""))) {
		throw new Error("Open the target channel and provide a valid message ID.");
	}

	const draftType = findByProps("SlashCommand", "ChannelMessage")?.SlashCommand
		?? findByProps("SlashCommand")?.SlashCommand;
	if (draftType === undefined) throw new Error("Discord's slash-command draft type was not found.");

	const files = getFiles(channelId, args, draftType);
	const restApi = findByProps("get", "post", "patch", "del");
	const messageStore = findByStoreName("MessageStore");
	const channelStore = findByStoreName("ChannelStore");
	const userStore = findByStoreName("UserStore");
	const permissions = findByStoreName("PermissionStore") ?? findByProps("getChannelPermissions", "can");
	const channel = channelStore?.getChannel?.(channelId) ?? context.channel;
	const currentUserId = userStore?.getCurrentUser?.()?.id;
	const message = messageStore?.getMessage?.(channelId, String(messageId));

	if (typeof restApi?.post !== "function" || typeof restApi?.patch !== "function") {
		throw new Error("Discord's upload API is unavailable.");
	}
	if (!channel || typeof currentUserId !== "string") throw new Error("Could not resolve the current channel or account.");
	validateMessage(message, channel, currentUserId, permissions, files.length);

	const uniqueId = findByProps("uniqueId")?.uniqueId;
	const requestedFiles = files.map(({ file }, index) => ({
		id: typeof uniqueId === "function" ? uniqueId() : `${Date.now()}-${index}`,
		filename: file.name,
		file_size: Number(file.size),
		is_clip: false,
	}));
	const uploadResponse = await restApi.post({
		url: `/channels/${channelId}/attachments`,
		body: { files: requestedFiles },
	});
	const uploadSlots = (uploadResponse?.body ?? uploadResponse)?.attachments;
	if (!Array.isArray(uploadSlots) || uploadSlots.length !== files.length) {
		throw new Error("Discord returned an invalid attachment upload response.");
	}

	const newAttachments = await Promise.all(uploadSlots.map(async (slot: any, index: number) => {
		if (typeof slot?.upload_url !== "string" || typeof slot?.upload_filename !== "string") {
			throw new Error("Discord returned an incomplete attachment upload slot.");
		}
		const response = await fetch(slot.upload_url, { method: "PUT", body: files[index].file });
		if (!response.ok) throw new Error(`Attachment upload failed (${response.status}).`);
		return {
			id: slot.id ?? requestedFiles[index].id,
			uploaded_filename: slot.upload_filename,
			filename: files[index].name,
		};
	}));

	const latestMessage = messageStore?.getMessage?.(channelId, String(messageId));
	validateMessage(latestMessage, channel, currentUserId, permissions, newAttachments.length);
	const editResponse = await restApi.patch({
		url: `/channels/${channelId}/messages/${messageId}`,
		body: {
			attachments: [...latestMessage.attachments, ...newAttachments],
		},
	});
	if (editResponse?.status != null && (editResponse.status < 200 || editResponse.status >= 300)) {
		throw new Error(`Discord rejected the message edit (${editResponse.status}).`);
	}

	showToast(`Added ${newAttachments.length} attachment${newAttachments.length === 1 ? "" : "s"}.`);
}

async function executeAddAttachments(args: any[], context: any) {
	const channelId = context?.channel?.id;
	const uploadManager = findByProps("clearAll", "promptToUpload");
	const draftType = findByProps("SlashCommand", "ChannelMessage")?.SlashCommand
		?? findByProps("SlashCommand")?.SlashCommand;
	try {
		await addAttachments(args, context);
	} catch (error) {
		console.error("[God Console] Could not add message attachments.", error);
		showToast(error instanceof Error ? error.message : "Could not add attachments.");
	} finally {
		if (typeof channelId === "string" && draftType !== undefined) {
			uploadManager?.clearAll?.(channelId, draftType);
		}
	}
}

export function setAddAttachmentsEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (!enabled) {
		unregisterCommand?.();
		unregisterCommand = undefined;
		return;
	}

	try {
		unregisterCommand = registerCommand({
			name: "addattachment",
			displayName: "Add Attachment",
			description: "Add up to three files to one of your messages in this channel.",
			shouldHide: () => true,
			options: [
				{
					name: "message_id",
					displayName: "Message ID",
					description: "ID of your message in this channel",
					type: STRING_OPTION,
					required: true,
				},
				...FILE_OPTION_NAMES.map((name, index) => ({
					name,
					displayName: `Attachment ${index + 1}`,
					description: `Optional file ${index + 1} to add`,
					type: ATTACHMENT_OPTION,
				})),
			],
			execute: executeAddAttachments,
		} as any);
	} catch (error) {
		enabled = false;
		console.error("[God Console] Could not register the add-attachment command.", error);
		showToast("Could not register /addattachment. Check the console for details.");
	}
}