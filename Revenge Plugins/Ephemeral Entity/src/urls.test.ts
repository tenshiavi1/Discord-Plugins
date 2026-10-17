import { expect, test } from "bun:test";
import { clearTrackingUrl, clearTrackingUrlsInMessage, clearTrackingUrlsInText } from "./urls";

test("removes known tracking parameters and preserves unrelated query parameters", () => {
	expect(clearTrackingUrl("https://example.com/path?utm_source=mail&keep=1&mc_cid=123"))
		.toBe("https://example.com/path?keep=1");
});

test("preserves surrounding punctuation when cleaning message text", () => {
	expect(clearTrackingUrlsInText("See (https://example.com/?fbclid=123)."))
		.toBe("See (https://example.com/).");
});

test("preserves message identity when there are no tracking URLs", () => {
	const message = { content: "No links here.", id: "message-id" };
	expect(clearTrackingUrlsInMessage(message)).toBe(message);
});