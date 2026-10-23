import { expect, test } from "bun:test";
import { canRetainDeletedMessage, markDeletedMessage, prependEditHistory } from "./messageHistoryPresentation";

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