import { findByProps } from "../../compat";
import { storage } from "@vendetta/plugin";
import { limitEmbedField, linkedEmbedField, parseChannelId, parseDiscordWebhookUrl, toDiscordTimestamp, toEmbedTimestamp } from "./logFormatting";
import { createDeliveryGate } from "./deliveryGate";

const FluxDispatcher = findByProps("dispatch", "subscribe", "unsubscribe");
const ChannelStore = findByProps("getChannel");
const UserStore = findByProps("getCurrentUser");
const RestAPI = findByProps("get", "post", "del", "patch");
const snowflakeUtils = findByProps("extractTimestamp");
const MAX_CACHED_MESSAGES = 500;
const deliveryGate = createDeliveryGate();
const CHAT_LOGGER_CLEANUP_KEY = "__omniscienceChatLoggerCleanup";
const globalLoggerState = globalThis as typeof globalThis & { [CHAT_LOGGER_CLEANUP_KEY]?: () => void };

type CachedMessage = {
	id: string;
	channelId: string;
	authorId: string;
	authorName: string;
	content: string;
	attachments: string[];
	embeds: string[];
	timestamp: string;
	guildId?: string;
};

for (const [key, value] of Object.entries({
	dmLoggerEnabled: false,
	dmLoggerSendToChannel: false,
	dmLoggerSendToWebhook: false,
	dmLoggerChannelId: "",
	dmLoggerWebhookUrl: "",
	messageLoggerEnabled: false,
	messageLoggerSendToChannel: false,
	messageLoggerSendToWebhook: false,
	messageLoggerSourceChannelId: "",
	messageLoggerDestinationChannelId: "",
	messageLoggerWebhookUrl: "",
	messageLoggerCache: [],
})) {
	if (storage[key] === undefined) storage[key] = value;
}

function getCache(): CachedMessage[] {
	if (!Array.isArray(storage.messageLoggerCache)) return [];
	return storage.messageLoggerCache.filter((entry: unknown): entry is CachedMessage =>
		typeof entry === "object" && entry !== null &&
		typeof (entry as CachedMessage).id === "string" &&
		typeof (entry as CachedMessage).channelId === "string" &&
		typeof (entry as CachedMessage).content === "string" &&
		Array.isArray((entry as CachedMessage).attachments),
	);
}

function getMessageKey(channelId: string, messageId: string) {
	return `${channelId}:${messageId}`;
}

function rememberMessage(message: CachedMessage) {
	const key = getMessageKey(message.channelId, message.id);
	const messages = getCache().filter((entry) => getMessageKey(entry.channelId, entry.id) !== key);
	storage.messageLoggerCache = [...messages, message].slice(-MAX_CACHED_MESSAGES);
}

function findCachedMessage(channelId: string, messageId: string) {
	return getCache().find((entry) => entry.channelId === channelId && entry.id === messageId);
}

function removeCachedMessage(channelId: string, messageId: string) {
	storage.messageLoggerCache = getCache().filter((entry) => entry.channelId !== channelId || entry.id !== messageId);
}

export function clearMessageLoggerCache() {
	storage.messageLoggerCache = [];
}

function getMessageDate(message: any, fallback = Date.now()): Date {
	const source = message?.edited_timestamp ?? message?.timestamp;
	const parsed = source === undefined ? Number.NaN : new Date(source).getTime();
	if (Number.isFinite(parsed)) return new Date(parsed);
	if (typeof message?.id === "string" && typeof snowflakeUtils?.extractTimestamp === "function") {
		try {
			const extracted = snowflakeUtils.extractTimestamp(message.id);
			const timestamp = extracted instanceof Date
				? extracted.getTime()
				: typeof extracted === "number"
					? extracted
					: typeof extracted === "string"
						? Date.parse(extracted)
						: Number.NaN;
			if (Number.isFinite(timestamp)) return new Date(timestamp);
		} catch (error) {
			console.warn("[Omniscience] Could not read a message timestamp.", error);
		}
	}
	return new Date(fallback);
}

function getAttachments(message: any): string[] {
	if (!Array.isArray(message?.attachments)) return [];
	return message.attachments.flatMap((attachment: any) => {
		const url = typeof attachment?.url === "string" ? attachment.url : attachment?.proxy_url;
		if (typeof url !== "string") return [];
		return [typeof attachment.filename === "string" ? `${attachment.filename}: ${url}` : url];
	});
}

function getEmbedText(message: any): string[] {
	if (!Array.isArray(message?.embeds)) return [];
	return message.embeds.flatMap((embed: any) => [
		embed?.title,
		embed?.description,
		...(Array.isArray(embed?.fields) ? embed.fields.flatMap((field: any) => [field?.name, field?.value]) : []),
	].filter((value): value is string => typeof value === "string" && value.length > 0));
}

function getMessageContent(message: any, previous?: CachedMessage): string {
	const content = typeof message?.content === "string" ? message.content : previous?.content ?? "";
	const attachments = Array.isArray(message?.attachments)
		? getAttachments(message)
		: previous?.attachments ?? [];
	const embeds = Array.isArray(message?.embeds) ? getEmbedText(message) : previous?.embeds ?? [];
	return [content, ...attachments, ...embeds].filter(Boolean).join("\n");
}

function getAuthorName(message: any, previous?: CachedMessage): string {
	return typeof message?.author?.username === "string"
		? message.author.username
		: previous?.authorName ?? "Unknown user";
}

function makeEmbed(title: string, fields: { name: string; value: string; inline?: boolean }[], date: Date) {
	return {
		title: limitEmbedField(title, 256),
		color: 0x5865f2,
		fields: fields.map((field) => ({
			name: field.name,
			value: limitEmbedField(field.value),
			inline: field.inline ?? true,
		})),
		timestamp: toEmbedTimestamp(date),
	};
}

async function postToChannel(channelInput: string, embed: ReturnType<typeof makeEmbed>): Promise<boolean> {
	const channelId = parseChannelId(channelInput);
	if (!channelId || typeof RestAPI?.post !== "function") {
		console.warn("[Omniscience] A valid destination channel and Discord REST module are required for chat logging.");
		return false;
	}
	try {
		await RestAPI.post({
			url: `/channels/${channelId}/messages`,
			body: { embeds: [embed], allowed_mentions: { parse: [] } },
		});
		return true;
	} catch (error) {
		console.error("[Omniscience] Could not send a chat log to the destination channel.", error);
		return false;
	}
}

function getWebhookUrl(value: unknown): string | undefined {
	return parseDiscordWebhookUrl(String(value ?? ""));
}

async function postToWebhook(value: unknown, embed: ReturnType<typeof makeEmbed>): Promise<boolean> {
	const webhookUrl = getWebhookUrl(value);
	if (!webhookUrl || typeof fetch !== "function") {
		console.warn("[Omniscience] A valid Discord webhook URL is required for chat logging.");
		return false;
	}
	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
		});
		if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}.`);
		return true;
	} catch (error) {
		console.error("[Omniscience] Could not send a chat log to the configured webhook.", error);
		return false;
	}
}

function hashEventValue(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
	}
	return (hash >>> 0).toString(36);
}

type LogTarget = {
	key: string;
	send: (embed: ReturnType<typeof makeEmbed>) => Promise<boolean>;
};

async function deliverLogOnce(
	eventKey: string,
	embed: ReturnType<typeof makeEmbed>,
	targets: LogTarget[],
): Promise<boolean> {
	if (targets.length === 0) return false;
	const results = await Promise.all(targets.map(async (target) => {
		if (deliveryGate.hasDelivered(eventKey, target.key)) return true;
		if (!deliveryGate.begin(eventKey, target.key)) return false;

		let succeeded = false;
		try {
			succeeded = await target.send(embed);
			return succeeded;
		} finally {
			deliveryGate.finish(eventKey, target.key, succeeded);
		}
	}));
	return results.every(Boolean);
}

function makeJumpUrl(channelId: string, messageId: string, guildId?: string) {
	return `https://discord.com/channels/${guildId ?? "@me"}/${channelId}/${messageId}`;
}

function getDmLogTargets(): LogTarget[] {
	const targets: LogTarget[] = [];
	if (storage.dmLoggerSendToChannel) {
		const channelInput = String(storage.dmLoggerChannelId ?? "");
		targets.push({ key: `channel:${parseChannelId(channelInput) ?? channelInput}`, send: (embed) => postToChannel(channelInput, embed) });
	}
	if (storage.dmLoggerSendToWebhook) {
		const webhookUrl = getWebhookUrl(storage.dmLoggerWebhookUrl);
		const webhookKey = webhookUrl ? hashEventValue(webhookUrl) : "invalid";
		targets.push({ key: `webhook:${webhookKey}`, send: (embed) => postToWebhook(storage.dmLoggerWebhookUrl, embed) });
	}
	return targets;
}

function logDirectMessage(message: any, channelId: string, channel: any, event: any) {
	if (storage.enabled === false || !storage.dmLoggerEnabled || message.author?.id === UserStore?.getCurrentUser?.()?.id) return;
	const channelType = channel?.type ?? message.channel_type ?? event?.channel_type;
	if ((channelType !== 1 && channelType !== 3) || channel?.guild_id || message.guild_id || event?.guild_id) return;

	const date = getMessageDate(message);
	const content = getMessageContent(message);
	const time = toDiscordTimestamp(date) ?? "Time unavailable";
	const embed = makeEmbed(`Direct Message: ${getAuthorName(message)}`, [
		{ name: "Message", value: content || "(no text)" },
		{ name: "Time", value: time },
	], date);

	const messageId = String(message.id ?? "");
	if (!messageId) return;
	void deliverLogOnce(`dm:${channelId}:${messageId}`, embed, getDmLogTargets());
}

function getMessageLogTargets(): LogTarget[] {
	const targets: LogTarget[] = [];
	if (storage.messageLoggerSendToChannel) {
		const channelInput = String(storage.messageLoggerDestinationChannelId ?? "");
		targets.push({ key: `channel:${parseChannelId(channelInput) ?? channelInput}`, send: (embed) => postToChannel(channelInput, embed) });
	}
	if (storage.messageLoggerSendToWebhook) {
		const webhookUrl = getWebhookUrl(storage.messageLoggerWebhookUrl);
		const webhookKey = webhookUrl ? hashEventValue(webhookUrl) : "invalid";
		targets.push({ key: `webhook:${webhookKey}`, send: (embed) => postToWebhook(storage.messageLoggerWebhookUrl, embed) });
	}
	return targets;
}

function makeCachedMessage(message: any, channelId: string, previous?: CachedMessage): CachedMessage {
	const date = getMessageDate(message);
	const channel = ChannelStore?.getChannel?.(channelId);
	return {
		id: String(message.id ?? previous?.id ?? ""),
		channelId,
		authorId: typeof message.author?.id === "string" ? message.author.id : previous?.authorId ?? "",
		authorName: getAuthorName(message, previous),
		content: typeof message.content === "string" ? message.content : previous?.content ?? "",
		attachments: Array.isArray(message.attachments) ? getAttachments(message) : previous?.attachments ?? [],
		embeds: Array.isArray(message.embeds) ? getEmbedText(message) : previous?.embeds ?? [],
		timestamp: toEmbedTimestamp(date) ?? new Date().toISOString(),
		guildId: message.guild_id ?? message.guildId ?? channel?.guild_id ?? previous?.guildId,
	};
}

function onMessageCreate(event: any) {
	if (storage.enabled === false) return;
	const message = event?.message ?? event;
	if (!message || typeof message.id !== "string") return;
	const channelId = String(message.channel_id ?? message.channelId ?? event?.channel_id ?? event?.channelId ?? "");
	if (!channelId) return;
	const channel = ChannelStore?.getChannel?.(channelId) ?? message.channel ?? event?.channel;

	logDirectMessage(message, channelId, channel, event);

	if (!storage.messageLoggerEnabled || parseChannelId(String(storage.messageLoggerSourceChannelId ?? "")) !== channelId) return;
	rememberMessage(makeCachedMessage(message, channelId));
}

function onMessageUpdate(event: any) {
	if (storage.enabled === false || !storage.messageLoggerEnabled) return;
	const message = event?.message;
	if (typeof message?.content !== "string" && !Array.isArray(message?.attachments) && !Array.isArray(message?.embeds)) return;
	const channelId = String(message?.channel_id ?? message?.channelId ?? event?.channelId ?? "");
	const messageId = String(message?.id ?? event?.id ?? "");
	if (!channelId || !messageId || parseChannelId(String(storage.messageLoggerSourceChannelId ?? "")) !== channelId) return;

	const cached = findCachedMessage(channelId, messageId);
	const nextContent = getMessageContent(message, cached);
	const originalContent = cached ? [cached.content, ...cached.attachments, ...cached.embeds].filter(Boolean).join("\n") : "";
	if (cached && nextContent !== originalContent) {
		const date = getMessageDate(message);
		const channel = ChannelStore?.getChannel?.(channelId);
		const link = makeJumpUrl(channelId, messageId, cached.guildId ?? channel?.guild_id ?? message.guild_id ?? event?.guildId ?? event?.guild_id);
		const time = toDiscordTimestamp(date) ?? "Time unavailable";
		const embed = makeEmbed(`Edited Message: ${cached.authorName}`, [
			{ name: "Original", value: originalContent || "(no text)" },
			{ name: "Edited", value: linkedEmbedField(nextContent || "(no text)", link) },
			{ name: "Time", value: time },
		], date);
		const version = String(message.edited_timestamp ?? event?.edited_timestamp ?? "");
		const eventKey = `edit:${channelId}:${messageId}:${version}:${hashEventValue(nextContent)}`;
		void deliverLogOnce(eventKey, embed, getMessageLogTargets())
			.then((sent) => { if (sent) rememberMessage(makeCachedMessage(message, channelId, cached)); });
		return;
	}
	rememberMessage(makeCachedMessage(message, channelId, cached));
}

function onMessageDelete(event: any) {
	if (storage.enabled === false || !storage.messageLoggerEnabled) return;
	const channelId = String(event?.channelId ?? event?.channel_id ?? "");
	const messageId = String(event?.id ?? "");
	if (!channelId || !messageId || parseChannelId(String(storage.messageLoggerSourceChannelId ?? "")) !== channelId) return;
	const cached = findCachedMessage(channelId, messageId);
	if (!cached) return;

	const date = new Date();
	const channel = ChannelStore?.getChannel?.(channelId);
	const link = makeJumpUrl(channelId, messageId, cached.guildId ?? channel?.guild_id);
	const time = toDiscordTimestamp(date) ?? "Time unavailable";
	const embed = makeEmbed(`Deleted Message: ${cached.authorName}`, [
		{ name: "Message", value: linkedEmbedField([cached.content, ...cached.attachments, ...cached.embeds].filter(Boolean).join("\n") || "(no text)", link) },
		{ name: "Time", value: time },
	], date);
	void deliverLogOnce(`delete:${channelId}:${messageId}`, embed, getMessageLogTargets())
		.then((sent) => { if (sent) removeCachedMessage(channelId, messageId); });
}

function onMessageDeleteBulk(event: any) {
	if (!Array.isArray(event?.ids)) return;
	const channelId = event.channelId ?? event.channel_id;
	for (const id of event.ids) onMessageDelete({ channelId, id });
}

export function installChatLogger(): () => void {
	if (typeof FluxDispatcher?.subscribe !== "function" || typeof FluxDispatcher?.unsubscribe !== "function") {
		console.warn("[Omniscience] Discord's message dispatcher was not found; chat logging is unavailable.");
		return () => {};
	}
	globalLoggerState[CHAT_LOGGER_CLEANUP_KEY]?.();

	const subscriptions = [
		["MESSAGE_CREATE", onMessageCreate],
		["MESSAGE_UPDATE", onMessageUpdate],
		["MESSAGE_DELETE", onMessageDelete],
		["MESSAGE_DELETE_BULK", onMessageDeleteBulk],
	] as const;
	for (const [event, listener] of subscriptions) FluxDispatcher.subscribe(event, listener);

	let active = true;
	const cleanup = () => {
		if (!active) return;
		active = false;
		for (const [event, listener] of subscriptions) FluxDispatcher.unsubscribe(event, listener);
		if (globalLoggerState[CHAT_LOGGER_CLEANUP_KEY] === cleanup) {
			delete globalLoggerState[CHAT_LOGGER_CLEANUP_KEY];
		}
	};

	globalLoggerState[CHAT_LOGGER_CLEANUP_KEY] = cleanup;
	return cleanup;
}