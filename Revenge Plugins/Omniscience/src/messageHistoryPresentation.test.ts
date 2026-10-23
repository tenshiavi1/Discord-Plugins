import { expect, test } from "bun:test";
import { canRetainDeletedMessage, getDeletedMessageHighlight, getMessageHighlightType, hasEditedTimestamp, markDeletedMessage, mergeRetainedMessages, prependEditHistory, pruneRecentMessageLogs, resolveMessageRowGenerator, shouldClearHistoryForNewSession, truncateEditVersion, type RecentMessageLog } from "./messageHistoryPresentation";

test("prepends plain struck-through versions to one rendered message", () => {
	const current = [{ type: "text", content: "new text" }];
	const result = prependEditHistory(current, [{ content: "old text" }, { content: "older text" }]) as any[];

	expect(result).toHaveLength(2);
	expect(result[0].type).toBe("blockQuote");
	expect(result[0].content[0].content[0].content[0].content).toBe("old text");
	expect(result[0].content[1].type).toBe("br");
	expect(result[0].content[2].content[0].content[0].content).toBe("older text");
	expect(result[1]).toBe(current[0]);
});

test("does not rewrite non-rendered or unchanged message content", () => {
	const content = "raw message content";
	expect(prependEditHistory(content, [{ content: "old text" }])).toBe(content);
	expect(prependEditHistory([content], [])).toEqual([content]);
});

test("caps retained edit text at 4,000 characters with a truncation marker", () => {
	const truncated = truncateEditVersion("x".repeat(4_001));
	expect(truncated).toHaveLength(4_001);
	expect(truncated.endsWith("\u2026")).toBe(true);
	expect(truncateEditVersion("short text")).toBe("short text");
});

test("recognizes snake_case and camelCase edit timestamps", () => {
	expect(hasEditedTimestamp({ edited_timestamp: "2026-10-23T00:00:00Z" })).toBe(true);
	expect(hasEditedTimestamp({ editedTimestamp: "2026-10-23T00:00:00Z" })).toBe(true);
	expect(hasEditedTimestamp({ edited_timestamp: null })).toBe(false);
});

test("resolves a row generator from its default module export", () => {
	class RowGenerator {
		generate() {}
	}
	const module = { default: RowGenerator };

	expect(resolveMessageRowGenerator(module)).toBe(RowGenerator);
	expect(resolveMessageRowGenerator({ default: {} })).toBeUndefined();
});

test("shows only message logs younger than five minutes", () => {
	const now = 1_000_000;
	const log = (timestamp: number): RecentMessageLog => ({
		timestamp,
		operation: "edit",
		stage: "history-captured",
		result: "success",
		detail: "one previous version recorded",
		channelId: "channel-id",
		messageId: String(timestamp),
	});

	expect(pruneRecentMessageLogs([log(now - 299_999), log(now - 300_000), log(now + 1)], now)).toEqual([log(now - 299_999)]);
	expect(log(now)).not.toHaveProperty("content");
});

test("keeps deleted rows red when mention highlighting is disabled", () => {
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

test("clears unsaved history only at the start of a new app session", () => {
	expect(shouldClearHistoryForNewSession(false, false)).toBe(true);
	expect(shouldClearHistoryForNewSession(true, false)).toBe(false);
	expect(shouldClearHistoryForNewSession(false, true)).toBe(false);
});

test("retains sent messages but rejects ephemeral and unsent messages", () => {
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT" })).toBe(true);
	expect(canRetainDeletedMessage({ flags: 64, state: "SENT" })).toBe(false);
	expect(canRetainDeletedMessage({ flags: 0, state: "FAILED" })).toBe(false);
	expect(canRetainDeletedMessage(undefined)).toBe(false);
});

test("marks a copy as deleted without mutating the stored message", () => {
	const original = { id: "123", content: "kept text" };
	const retained = markDeletedMessage(original);

	expect(retained).not.toBe(original);
	expect(retained.was_deleted).toBe(true);
	expect(retained.content).toBe(original.content);
	expect(original).not.toHaveProperty("was_deleted");
});

test("merges retained rows back into a message list in snowflake order", () => {
	const current = [{ id: "20", content: "newer" }, { id: "10", content: "older" }];
	const deleted = { id: "15", content: "retained", was_deleted: true };

	expect(mergeRetainedMessages(current, [deleted])).toEqual([
		{ id: "10", content: "older" },
		deleted,
		{ id: "20", content: "newer" },
	]);
});

test("merges retained rows into immutable message collections without changing the source", () => {
	const createCollection = (messages: { id: string; content: string }[]) => ({
		_array: messages,
		hasMoreBefore: false,
		hasMoreAfter: false,
		clone() {
			return createCollection([...this._array]);
		},
		merge(additions: readonly { id: string; content: string }[]) {
			return createCollection([...this._array, ...additions]);
		},
		mutate(callback: (copy: { _array: { id: string; content: string }[] }) => void) {
			const copy = { _array: [...this._array] };
			callback(copy);
			return createCollection(copy._array);
		},
	});
	const source = createCollection([{ id: "20", content: "newer" }, { id: "10", content: "older" }]);
	const deleted = { id: "15", content: "retained" };
	const result = mergeRetainedMessages(source, [deleted]) as ReturnType<typeof createCollection>;

	expect(result._array.map((message) => message.id)).toEqual(["10", "15", "20"]);
	expect(source._array.map((message) => message.id)).toEqual(["20", "10"]);
});