export type EditHistoryVersion = { content: string; timestamp?: string };

export const MAX_EDIT_VERSION_LENGTH = 4000;
export const MAX_EDIT_VERSIONS = 10;

export function isEphemeralMessage(message: any) {
	return ((Number(message?.flags) || 0) & 64) !== 0;
}

export function canRetainDeletedMessage(message: { flags?: unknown; state?: unknown } | null | undefined) {
	if (!message || (message.state != null && message.state !== "SENT")) return false;
	if ((message as { author?: { id?: unknown } }).author?.id === "1") return false;
	return !isEphemeralMessage(message);
}

export function createDeletedMessageUpdate<T extends {
	id?: unknown;
	channel_id?: unknown;
	flags?: unknown;
	state?: unknown;
	author?: { id?: unknown };
}>(message: T) {
	if (
		typeof message?.id !== "string" ||
		typeof message.channel_id !== "string" ||
		!canRetainDeletedMessage(message)
	) return undefined;
	return {
		type: "MESSAGE_UPDATE" as const,
		message: { ...message, __omniscienceDeleted: true },
	};
}

export function getMessageFromChannelStore(store: any, channelId: string, messageId: string) {
	const channel =
		store?.get?.(channelId) ??
		store?._channelMessages?.get?.(channelId) ??
		store?._channelMessages?.[channelId];
	return channel?.get?.(messageId) ??
		channel?._array?.find?.((entry: any) => String(entry?.id) === messageId);
}

export function getMessageUpdateDetails(event: any) {
	const message = event?.message ?? event;
	return {
		message,
		channelId: String(message?.channel_id ?? message?.channelId ?? event?.channelId ?? event?.channel_id ?? ""),
		messageId: String(message?.id ?? event?.id ?? ""),
		editedTimestamp: message?.edited_timestamp ?? message?.editedTimestamp,
	};
}

export function toPlainMessageRecord(message: any) {
	try {
		const value = typeof message?.toJS === "function" ? message.toJS() : message;
		return value && typeof value === "object" ? { ...value } : undefined;
	} catch (error) {
		console.warn("[Omniscience] Could not convert a message record.", error);
		return undefined;
	}
}

export function truncateEditVersion(content: string) {
	return content.length > MAX_EDIT_VERSION_LENGTH
		? `${content.slice(0, MAX_EDIT_VERSION_LENGTH)}\u2026`
		: content;
}

export function appendEditHistoryVersion(
	versions: readonly EditHistoryVersion[],
	previousContent: string,
	currentContent: string,
	timestamp?: string,
) {
	if (previousContent === currentContent) return undefined;
	return [...versions, {
		content: truncateEditVersion(previousContent),
		...(timestamp ? { timestamp } : {}),
	}].slice(-MAX_EDIT_VERSIONS);
}

export function prependEditHistory(content: unknown, versions: readonly EditHistoryVersion[]) {
	if (!Array.isArray(content) || versions.length === 0) return content;
	const lines = versions.flatMap((version, index) => [
		...(index ? [{ type: "br" }] : []),
		{
			type: "subtext",
			content: [{ type: "s", content: [{ type: "text", content: version.content || "(empty)" }] }],
		},
	]);
	return [{ type: "blockQuote", content: lines }, ...content];
}

export function resolveMessageRowGenerator(module: any) {
	const candidate = module?.default ?? module?.RowGenerator ?? module;
	return typeof candidate?.prototype?.generate === "function" ? candidate : undefined;
}

export function getDeletedMessageHighlight(enabled: boolean, color: string, thickness: number) {
	return {
		color: enabled ? color : "#f23f43",
		thickness: enabled ? thickness : 1,
	};
}

export function getMessageHighlightType(
	deletedEnabled: boolean,
	deleted: boolean,
	highlightsEnabled: boolean,
	mentioned: boolean,
) {
	if (deletedEnabled && deleted) return "deleted";
	if (highlightsEnabled && mentioned) return "mention";
	return undefined;
}

export function markDeletedMessage<T extends object>(message: T): T & { __omniscienceDeleted: boolean } {
	let retained: T & { __omniscienceDeleted: boolean };
	try {
		retained = Object.create(Object.getPrototypeOf(message), Object.getOwnPropertyDescriptors(message));
	} catch {
		retained = { ...message } as T & { __omniscienceDeleted: boolean };
	}
	try {
		Object.defineProperty(retained, "__omniscienceDeleted", { value: true, enumerable: true, configurable: true });
	} catch {
		retained.__omniscienceDeleted = true;
	}
	return retained;
}
