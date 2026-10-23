import { expect, test } from "bun:test";
import {
	composeTranslatedContent,
	createTranslationLayout,
	restoreTranslatedContent,
} from "./translationCore";

test("translates text while preserving formatting and non-text nodes", () => {
	const mention = { type: "userMention", userId: "123" };
	const content = [
		{ type: "strong", content: [{ type: "text", content: "Hola" }] },
		{ type: "text", content: " " },
		mention,
		{ type: "text", content: " a todos" },
	];
	const layout = createTranslationLayout(content);

	expect(layout).not.toBeNull();
	expect(layout?.text).toContain("<g i=0>Hola</g>");
	expect(layout?.text).toContain("<a i=1/>");
	expect(restoreTranslatedContent('<g i=0>Hello</g> <a i=1/> everyone', layout!)).toEqual([
		{ type: "strong", content: [{ type: "text", content: "Hello" }] },
		{ type: "text", content: " " },
		mention,
		{ type: "text", content: " everyone" },
	]);
});

test("rejects missing, duplicated, or retyped protected nodes", () => {
	const layout = createTranslationLayout([
		{ type: "text", content: "Hola amigo" },
		{ type: "codeBlock", content: [{ type: "text", content: "const x = 1" }] },
	]);
	expect(layout).not.toBeNull();
	expect(restoreTranslatedContent("Hello friend", layout!)).toBeNull();
	expect(restoreTranslatedContent("Hello <a i=0/> <a i=0/>", layout!)).toBeNull();
	expect(restoreTranslatedContent("<g i=0>wrong node</g>", layout!)).toBeNull();
});

test("skips short or non-linguistic content", () => {
	expect(createTranslationLayout([{ type: "text", content: "ok" }])).toBeNull();
	expect(createTranslationLayout([{ type: "emoji", id: "1" }])).toBeNull();
});

test("adds language note and quotes the original text", () => {
	const original = [{ type: "text", content: "Hola a todos" }];
	const layout = createTranslationLayout(original)!;
	expect(composeTranslatedContent("Hello everyone", layout, original, {
		showLanguage: true,
		showOriginal: true,
		language: "Spanish",
	})).toEqual([
		{ type: "text", content: "Hello everyone" },
		{ type: "br" },
		{ type: "subtext", content: [{ type: "text", content: "Translated from Spanish. Original:" }] },
		{ type: "blockQuote", content: original },
	]);
});