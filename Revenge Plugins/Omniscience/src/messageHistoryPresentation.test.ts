import { expect, test } from "bun:test";
import { appendEditHistoryVersion, canRetainDeletedMessage, getDeletedMessageHighlight, getMessageHighlightType, hasEditedTimestamp, isEphemeralMessage, isLegacyEditNotice, markDeletedMessage, mergeRetainedMessages, prependEditHistory, removeEditedDeletedMessage, removeLegacyEditNotices, resolveMessageRowGenerator, shouldClearHistoryForNewSession, truncateEditVersion } from "./messageHistoryPresentation";

test("renders previous edits as plain native quote nodes", () => {
	const current = [{ type: "text", content: "new text" }];
	const result = prependEditHistory(current, [{ content: "old text" }, { content: "older text" }]) as any[];

	expect(result).toHaveLength(2);
	expect(result[0].type).toBe("blockQuote");
	expect(result[0].content[0].content[0].content[0].content).toBe("old text");
	expect(result[0].content[1].type).toBe("br");
	expect(result[0].content[2].content[0].content[0].content).toBe("older text");
	expect(result[1]).toBe(current[0]);
});

test("does not alter content without prior edits and caps old text", () => {
	const content = [{ type: "text", content: "current" }];
	expect(prependEditHistory(content, [])).toBe(content);
	expect(truncateEditVersion("short text")).toBe("short text");
	expect(truncateEditVersion("x".repeat(4_001))).toBe(`${"x".repeat(4_000)}\u2026`);
});

test("stores only changed prior values and retains the latest ten versions", () => {
	const versions = Array.from({ length: 10 }, (_, index) => ({ content: `v${index}` }));
	expect(appendEditHistoryVersion(versions, "same", "same")).toBeUndefined();
	const next = appendEditHistoryVersion(versions, "v10", "current", "2026-10-23T00:00:00Z");
	expect(next).toHaveLength(10);
	expect(next?.[0].content).toBe("v1");
	expect(next?.[9]).toEqual({ content: "v10", timestamp: "2026-10-23T00:00:00Z" });
});

test("identifies real edits and rejects ephemeral messages", () => {
	expect(hasEditedTimestamp({ edited_timestamp: "2026-10-23T00:00:00Z" })).toBe(true);
	expect(hasEditedTimestamp({ editedTimestamp: "2026-10-23T00:00:00Z" })).toBe(true);
	expect(hasEditedTimestamp({ edited_timestamp: null })).toBe(false);
	expect(isEphemeralMessage({ flags: 64 })).toBe(true);
	expect(isEphemeralMessage({ flags: 0 })).toBe(false);
});

test("resolves a row generator from its default module export", () => {
	class RowGenerator {
		generate() {}
	}
	const module = { default: RowGenerator };

	expect(resolveMessageRowGenerator(module)).toBe(RowGenerator);
	expect(resolveMessageRowGenerator({ default: {} })).toBeUndefined();
});

test("filters only legacy synthetic edit notices from message results", () => {
	const realMessage = { id: "1", content: "real" };
	const legacyNotice = { id: "2", content: "old", omniscienceOriginalMessageId: "1" };

	expect(isLegacyEditNotice(legacyNotice)).toBe(true);
	expect(isLegacyEditNotice(realMessage)).toBe(false);
	expect(removeLegacyEditNotices([realMessage, legacyNotice])).toEqual([realMessage]);
});

test("filters legacy edit notices from an immutable message collection", () => {
	const createCollection = (messages: object[]) => ({
		_array: messages,
		clone() {
			return createCollection([...this._array]);
		},
		mutate(callback: (copy: { _array: unknown[] }) => void) {
			const copy = { _array: [...this._array] };
			callback(copy);
			return createCollection(copy._array);
		},
	});
	const realMessage = { id: "1", content: "real" };
	const legacyNotice = { id: "2", content: "old", omniscienceOriginalMessageId: "1" };
	const source = createCollection([realMessage, legacyNotice]);
	const result = removeLegacyEditNotices(source) as ReturnType<typeof createCollection>;

	expect(result._array).toEqual([realMessage]);
	expect(source._array).toEqual([realMessage, legacyNotice]);
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

test("removes stale retained-delete rows when the message is edited", () => {
	const key = "channel:message";
	const deleted = { original: { content: "old text" }, retained: { was_deleted: true } };
	const retained = new Map([[key, deleted]]);

	expect(removeEditedDeletedMessage(retained, key, "new text")).toBe(deleted);
	expect(retained.has(key)).toBe(false);
	expect(removeEditedDeletedMessage(new Map([[key, deleted]]), key, "old text")).toBeUndefined();
});

test("clears unsaved history only at the start of a new app session", () => {
	expect(shouldClearHistoryForNewSession(false, false)).toBe(true);
	expect(shouldClearHistoryForNewSession(true, false)).toBe(false);
	expect(shouldClearHistoryForNewSession(false, true)).toBe(false);
});

test("retains sent messages but rejects ephemeral and unsent messages", () => {
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT" })).toBe(true);
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT", author: { id: "current-user" } })).toBe(true);
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