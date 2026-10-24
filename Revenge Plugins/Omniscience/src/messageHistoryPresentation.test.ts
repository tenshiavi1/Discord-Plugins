import { expect, test } from "bun:test";
import {
	appendEditHistoryVersion,
	canRetainDeletedMessage,
	createDeletedMessageUpdate,
	getMessageFromChannelStore,
	getMessageUpdateDetails,
	getDeletedMessageHighlight,
	getMessageHighlightType,
	isEphemeralMessage,
	markDeletedMessage,
	prependEditHistory,
	resolveMessageRowGenerator,
	toPlainMessageRecord,
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
	expect(canRetainDeletedMessage({ flags: 0, state: "SENT", author: { id: "1" } })).toBe(false);
	expect(canRetainDeletedMessage({ flags: 64, state: "SENT" })).toBe(false);
	expect(canRetainDeletedMessage({ flags: 0, state: "FAILED" })).toBe(false);
	expect(canRetainDeletedMessage(undefined)).toBe(false);
	expect(isEphemeralMessage({ flags: 64 })).toBe(true);
	expect(isEphemeralMessage({ flags: 0 })).toBe(false);
});

test("replaces only retainable deletes with a full marked message update", () => {
	const message = {
		id: "123",
		channel_id: "456",
		content: "deleted text",
		state: "SENT",
		author: { id: "789" },
		attachments: [{ id: "a" }],
	};
	expect(createDeletedMessageUpdate(message)).toEqual({
		type: "MESSAGE_UPDATE",
		message: { ...message, __omniscienceDeleted: true },
	});
	expect(createDeletedMessageUpdate({ ...message, state: "SEND_FAILED" })).toBeUndefined();
	expect(createDeletedMessageUpdate({ ...message, author: { id: "1" } })).toBeUndefined();
});

test("reads ChannelMessages through its public channel and message getters", () => {
	const message = { id: "123", content: "cached" };
	const store = {
		get(channelId: string) {
			return channelId === "456" ? {
				get(messageId: string) {
					return messageId === "123" ? message : undefined;
				},
			} : undefined;
		},
	};

	expect(getMessageFromChannelStore(store, "456", "123")).toBe(message);
	expect(getMessageFromChannelStore(store, "456", "missing")).toBeUndefined();
	expect(getMessageFromChannelStore({ _channelMessages: { "456": { _array: [message] } } }, "456", "123")).toBe(message);
});

test("resolves identity from Discord's nested MESSAGE_UPDATE event shape", () => {
	const details = getMessageUpdateDetails({
		type: "MESSAGE_UPDATE",
		message: {
			id: "123",
			channel_id: "456",
			content: "edited",
			edited_timestamp: "2026-10-24T00:00:00.000Z",
		},
	});

	expect(details).toEqual({
		message: {
			id: "123",
			channel_id: "456",
			content: "edited",
			edited_timestamp: "2026-10-24T00:00:00.000Z",
		},
		channelId: "456",
		messageId: "123",
		editedTimestamp: "2026-10-24T00:00:00.000Z",
	});
});

test("converts immutable Discord message records before adding logger metadata", () => {
	const source = {
		id: "123",
		toJS: () => ({ id: "123", content: "deleted" }),
	};

	expect(toPlainMessageRecord(source)).toEqual({ id: "123", content: "deleted" });
	expect(toPlainMessageRecord(undefined)).toBeUndefined();
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
	expect(retained.__omniscienceDeleted).toBe(true);
	expect(retained.content).toBe(original.content);
	expect(original).not.toHaveProperty("__omniscienceDeleted");
});
