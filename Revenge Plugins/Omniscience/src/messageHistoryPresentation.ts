export type EditHistoryVersion = { content: string };

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

export function canRetainDeletedMessage(message: { flags?: unknown; state?: unknown } | null | undefined) {
	if (!message || (message.state != null && message.state !== "SENT")) return false;
	return ((Number(message.flags) || 0) & 64) === 0;
}

export function markDeletedMessage<T extends object>(message: T): T & { was_deleted: boolean } {
	let retained: T & { was_deleted: boolean };
	try {
		retained = Object.create(Object.getPrototypeOf(message), Object.getOwnPropertyDescriptors(message));
	} catch {
		retained = { ...message } as T & { was_deleted: boolean };
	}
	try {
		Object.defineProperty(retained, "was_deleted", { value: true, enumerable: true, configurable: true });
	} catch {
		retained.was_deleted = true;
	}
	return retained;
}