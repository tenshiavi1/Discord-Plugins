import { expect, test } from "bun:test";
import { limitEmbedField, linkedEmbedField, parseChannelId, parseDiscordWebhookUrl, toDiscordTimestamp, toEmbedTimestamp, underlineFirstMatch } from "./logFormatting";

test("parses channel IDs from IDs and Discord channel links", () => {
	const channelId = "123456789012345678";
	expect(parseChannelId(channelId)).toBe(channelId);
	expect(parseChannelId(`https://discord.com/channels/987654321098765432/${channelId}`)).toBe(channelId);
	expect(parseChannelId(`https://discord.com/channels/@me/${channelId}`)).toBe(channelId);
	expect(parseChannelId(`https://example.com/channels/@me/${channelId}`)).toBeUndefined();
	expect(parseChannelId("not a channel")).toBeUndefined();
});

test("accepts only HTTPS Discord webhook URLs", () => {
	const webhook = "https://discord.com/api/webhooks/123456789012345678/secret-token";
	expect(parseDiscordWebhookUrl(webhook)).toBe(webhook);
	expect(parseDiscordWebhookUrl("http://discord.com/api/webhooks/123456789012345678/token")).toBeUndefined();
	expect(parseDiscordWebhookUrl("https://example.com/api/webhooks/123456789012345678/token")).toBeUndefined();
});

test("formats timestamps using Discord's viewer-local timestamp syntax", () => {
	const date = new Date("2026-10-21T12:34:56.000Z");
	expect(toDiscordTimestamp(date)).toBe("<t:1792586096:F>");
	expect(toEmbedTimestamp(date)).toBe("2026-10-21T12:34:56.000Z");
	expect(toDiscordTimestamp("invalid")).toBeUndefined();
});

test("underlines the first tracked keyword without changing surrounding text", () => {
	expect(underlineFirstMatch("Please check OMNISCIENCE today", "omniscience", false))
		.toBe("Please check __OMNISCIENCE__ today");
	expect(underlineFirstMatch("word tracker", "missing", false)).toBe("word tracker");
});

test("limits embed field text to the Discord field length", () => {
	expect(limitEmbedField("message", 5)).toBe("me...");
	expect(limitEmbedField("")).toBe("(no text)");
	expect(linkedEmbedField("message", "https://discord.com/channels/@me/123/456", 50).endsWith("[Open message](https://discord.com/channels/@me/123/456)"))
		.toBe(true);
});