import { expect, test } from "bun:test";
import { messageMentionIds } from "./validUserCore";

test("collects every user mention from message text and embeds", () => {
	const message = {
		content: "<@12345678901234567> and <@!22345678901234567>",
		embeds: [{ description: "Also <@32345678901234567>", fields: [{ value: "<@42345678901234567>" }] }],
	};

	expect([...messageMentionIds(message)]).toEqual([
		"12345678901234567",
		"22345678901234567",
		"32345678901234567",
		"42345678901234567",
	]);
});

test("collects nested and forwarded mentions without duplicates", () => {
	const message: Record<string, unknown> = {
		content: "<@12345678901234567>",
		components: [{ content: "<@22345678901234567>", components: [{ content: "<@32345678901234567>" }] }],
		message_snapshots: [{ message: { content: "<@12345678901234567> and <@42345678901234567>" } }],
	};
	message.self = message;

	expect([...messageMentionIds(message)]).toEqual([
		"12345678901234567",
		"22345678901234567",
		"32345678901234567",
		"42345678901234567",
	]);
});

test("ignores malformed mention IDs", () => {
	expect([...messageMentionIds({ content: "<@123> <@not-a-user> <@52345678901234567>" })])
		.toEqual(["52345678901234567"]);
});

test("collects mention batches larger than the old request cap", () => {
	const ids = Array.from({ length: 125 }, (_, index) => String(10000000000000000n + BigInt(index)));
	const content = ids.map((id) => `<@${id}>`).join(" ");

	expect(messageMentionIds({ content }).size).toBe(125);
});
