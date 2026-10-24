import { expect, test } from "bun:test";
import {
	appendEditHistoryVersion,
	canRetainDeletedMessage,
	getDeletedMessageHighlight,
	getMessageHighlightType,
	isEphemeralMessage,
	markDeletedMessage,
	mergeRetainedMessages,
	prependEditHistory,
	resolveMessageRowGenerator,
	truncateEditVersion,
} from "./messageHistoryPresentation";

test("renders previous edits as plain native quote nodes", () => {
	const current = [{ type: "text", content: "new text" }];
	const result = prependEditHistory(current, [{ content: "old text" }, { content: "older text" }]) as any[];

	expect(result).toHaveLength(2);
	expect(result[0].type).toBe("blockQuote");
	expect(result[0].content[0].content[0].content[0].content).toBe("old text");
	expect(result[0].content[1].type).toBe("br");
	expect(result[0].content[2].content[0].content[0].content).toBe("older text");
	expect(result[1]).toBe(current[0]);
	expect(prependEditHistory(current, [])).toBe(current);
});

test("stores changed prior text and retains only the latest ten versions", () => {
	const versions = Array.from({ length: 10 }, (_, index) => ({ content: `v${index}` }));
	expect(appendEditHistoryVersion(versions, "same", "same")).toBeUndefined();
	const next = appendEditHistoryVersion(versions, "v10", "current", "2026-10-23T00:00:00Z");

	expect(next).toHaveLength(10);
	expect(next?.[0].content).toBe("v1");
	expect(next?.[9]).toEqual({ content: "v10", timestamp: "2026-10-23T00:00:00Z" });
	expect(truncateEditVersion("short text")).toBe("short text");
	expect(truncateEditVersion("x".repeat(4_001))).toBe(`${"x".repeat(4_000)}\u2026`);
});

test("keeps only sent, non-ephemeral deleted messages", () => {
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT" })).toBe(true);
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT", author: { id: "self" } })).toBe(true);
	expect(canRetainDeletedMessage({ flags: 64, state: "SENT" })).toBe(false);
	expect(canRetainDeletedMessage({ flags: 0, state: "FAILED" })).toBe(false);
	expect(canRetainDeletedMessage(undefined)).toBe(false);
	expect(isEphemeralMessage({ flags: 64 })).toBe(true);
	expect(isEphemeralMessage({ flags: 0 })).toBe(false);
});

test("resolves the message row generator from its default export", () => {
	class RowGenerator {
		generate() {}
	}

	expect(resolveMessageRowGenerator({ default: RowGenerator })).toBe(RowGenerator);
	expect(resolveMessageRowGenerator({ default: {} })).toBeUndefined();
});

test("keeps deleted rows highlighted independently of mention highlighting", () => {
	expect(getMessageHighlightType(true, true, false, false)).toBe("deleted");
	expect(getMessageHighlightType(false, true, false, false)).toBeUndefined();
	expect(getDeletedMessageHighlight(false, "#00a8fc", 4)).toEqual({
		color: "#f23f43",
		thickness: 1,
	});
	expect(getDeletedMessageHighlight(true, "#00a8fc", 3)).toEqual({
		color: "#00a8fc",
		thickness: 3,
	});
});

test("marks an immutable copy so the original store record stays untouched", () => {
	const original = { id: "123", content: "kept text" };
	const retained = markDeletedMessage(original);

	expect(retained).not.toBe(original);
	expect(retained.was_deleted).toBe(true);
	expect(retained.content).toBe(original.content);
	expect(original).not.toHaveProperty("was_deleted");
});

test("replaces the matching row and sorts retained records by snowflake", () => {
	const messages = [{ id: "20", content: "newer" }, { id: "10", content: "older" }];
	const deleted = { id: "15", content: "retained", was_deleted: true };

	expect(mergeRetainedMessages(messages, [deleted])).toEqual([
		{ id: "10", content: "older" },
		deleted,
		{ id: "20", content: "newer" },
	]);
	expect(mergeRetainedMessages([{ id: "15", content: "live" }], [deleted])).toEqual([deleted]);
});

test("merges retained rows into Discord-style immutable message collections", () => {
	const createCollection = (messages: { id: string; content: string }[]) => ({
		_array: messages,
		hasMoreBefore: false,
		hasMoreAfter: false,
		clone() {
			return createCollection([...this._array]);
		},
		merge(additions: readonly { id: string; content: string }[]) {
			const merged = [...this._array];
			for (const message of additions) {
				const index = merged.findIndex((entry) => entry.id === message.id);
				if (index < 0) merged.push(message);
				else merged[index] = message;
			}
			return createCollection(merged);
		},
		mutate(callback: (copy: { _array: { id: string; content: string }[] }) => void) {
			const copy = { _array: [...this._array] };
			callback(copy);
			return createCollection(copy._array);
		},
	});
	const source = createCollection([{ id: "20", content: "newer" }, { id: "10", content: "older" }]);
	const retained = { id: "15", content: "deleted" };
	const result = mergeRetainedMessages(source, [retained]) as ReturnType<typeof createCollection>;

	expect(result._array.map(({ id }) => id)).toEqual(["10", "15", "20"]);
	expect(source._array.map(({ id }) => id)).toEqual(["20", "10"]);
});

test("does not merge an out-of-window retained row into a paginated result", () => {
	const source = {
		_array: [{ id: "20" }, { id: "30" }],
		hasMoreBefore: true,
		hasMoreAfter: false,
		merge() {
			throw new Error("out-of-window row should not be merged");
		},
	};

	expect(mergeRetainedMessages(source, [{ id: "10" }])).toBe(source);
});
