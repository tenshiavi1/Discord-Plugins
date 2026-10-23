export type EditHistoryVersion = { content: string };
export const MAX_EDIT_VERSION_LENGTH = 4000;

export function truncateEditVersion(content: string) {
	return content.length > MAX_EDIT_VERSION_LENGTH
		? `${content.slice(0, MAX_EDIT_VERSION_LENGTH)}\u2026`
		: content;
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

function compareMessageIds(left: unknown, right: unknown) {
	const leftId = String((left as { id?: unknown } | null)?.id ?? "");
	const rightId = String((right as { id?: unknown } | null)?.id ?? "");
	if (!/^\d+$/.test(leftId) || !/^\d+$/.test(rightId)) return 0;
	return leftId.length - rightId.length || (leftId === rightId ? 0 : leftId < rightId ? -1 : 1);
}

export function mergeRetainedMessages<T>(collection: T, retained: readonly object[]): T {
	if (!retained.length || !collection) return collection;
	if (Array.isArray(collection)) {
		const messages = [...collection];
		for (const message of retained) {
			const id = (message as { id?: unknown }).id;
			const existing = messages.findIndex((item) => (item as { id?: unknown } | null)?.id === id);
			if (existing < 0) messages.push(message);
			else messages[existing] = message;
		}
		return messages.sort(compareMessageIds) as T;
	}
	const source = collection as T & {
		_array?: unknown[];
		hasMoreBefore?: boolean;
		hasMoreAfter?: boolean;
		clone?: () => typeof source;
		merge?: (messages: readonly object[]) => typeof source;
		mutate?: (callback: (copy: { _array: unknown[] }) => void, force?: boolean) => typeof source;
	};
	if (typeof source.merge !== "function") return collection;
	const firstId = String((source._array?.[0] && (source._array[0] as { id?: unknown }).id) ?? "");
	const lastMessage = source._array?.[source._array.length - 1] as { id?: unknown } | undefined;
	const lastId = String(lastMessage?.id ?? "");
	const bounded = /^\d+$/.test(firstId);
	const inWindow = retained.filter((message) => {
		const id = String((message as { id?: unknown }).id ?? "");
		if (!bounded || !/^\d+$/.test(id)) return true;
		if (id.length - firstId.length < 0 || (id.length === firstId.length && id < firstId)) return source.hasMoreBefore !== true;
		if (/^\d+$/.test(lastId) && (id.length - lastId.length > 0 || (id.length === lastId.length && id > lastId))) return source.hasMoreAfter !== true;
		return true;
	});
	if (!inWindow.length) return collection;
	const clone = source.clone;
	const base = clone ? clone.call(source) : source;
	if (typeof base.merge !== "function") return collection;
	let merged = base.merge(inWindow);
	if (typeof merged.mutate === "function" && Array.isArray(merged._array)) {
		merged = merged.mutate((copy) => copy._array.sort(compareMessageIds), true);
	}
	return merged as T;
}