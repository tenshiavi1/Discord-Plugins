export type MessageNode = {
	type?: string;
	content?: unknown;
	[key: string]: unknown;
};

export type TranslationLayout = {
	text: string;
	nodes: MessageNode[];
	lines: boolean;
};

const TRANSLATABLE_GROUPS = new Set([
	"strong",
	"em",
	"u",
	"s",
	"spoiler",
	"blockQuote",
	"subtext",
	"heading",
	"paragraph",
	"link",
]);
const HAS_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u1FFF\u2C00-\uD7FF\uF900-\uFDFF\uFE70-\uFEFF\uFF21-\uFF5A\uFF66-\uFFDC]/;
const TAG = /<a\s+i\s*=\s*"?(\d+)"?\s*\/\s*>|<g\s+i\s*=\s*"?(\d+)"?\s*>|<\/g\s*>/g;
const MAX_TRANSLATION_TEXT = 4500;

function escapeText(text: string) {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createTranslationLayout(content: unknown): TranslationLayout | null {
	if (!Array.isArray(content)) return null;
	const nodes: MessageNode[] = [];
	let lines = false;
	let letters = 0;
	let failed = false;

	function walk(children: unknown[], depth: number): string {
		if (depth > 8) {
			failed = true;
			return "";
		}
	let text = "";
		for (const value of children) {
			if (!value || typeof value !== "object") continue;
			const node = value as MessageNode;
			if (node.type === "text" && typeof node.content === "string") {
				const part = node.content.replace(/\u200b/g, "");
				if (letters < 3) {
					let count = 0;
					for (const character of part) {
						if (HAS_LETTER.test(character)) count++;
					}
					letters = Math.min(3, letters + count);
				}
				text += escapeText(part);
				continue;
			}
			if (node.type === "br" || node.type === "newline") {
				lines = true;
				text += "\n";
				continue;
			}
			if (TRANSLATABLE_GROUPS.has(String(node.type)) && Array.isArray(node.content)) {
				const index = nodes.push(node) - 1;
				text += `<g i=${index}>${walk(node.content, depth + 1)}</g>`;
				continue;
			}
			const index = nodes.push(node) - 1;
			text += `<a i=${index}/>`;
		}
		return text;
	}

	const text = walk(content, 0);
	if (failed || letters < 3 || text.length > MAX_TRANSLATION_TEXT) return null;
	return { text, nodes, lines };
}

function unescapeText(text: string) {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&#39;|&#x27;/g, "'")
		.replace(/&quot;/g, '"');
}

export function restoreTranslatedContent(
	translated: string,
	layout: TranslationLayout,
): MessageNode[] | null {
	if (!layout) return null;
	const root: MessageNode[] = [];
	const stack: { children: MessageNode[]; index: number }[] = [{ children: root, index: -1 }];
	const used = new Set<number>();

	function addText(value: string) {
		if (!value) return;
		const current = stack[stack.length - 1].children;
		if (!layout.lines) {
			current.push({ type: "text", content: value });
			return;
		}
		value.split("\n").forEach((part, index) => {
			if (index) current.push({ type: "br" });
			if (part) current.push({ type: "text", content: part });
		});
	}

	TAG.lastIndex = 0;
	let cursor = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG.exec(translated))) {
		addText(unescapeText(translated.slice(cursor, match.index)));
		cursor = TAG.lastIndex;
		if (match[1] !== undefined || match[2] !== undefined) {
			const index = Number(match[1] ?? match[2]);
			const node = layout.nodes[index];
			const group = match[2] !== undefined;
			const isGroup = Boolean(node && TRANSLATABLE_GROUPS.has(String(node.type)) && Array.isArray(node.content));
			if (!node || used.has(index) || group !== isGroup) return null;
			used.add(index);
			if (group) stack.push({ children: [], index });
			else stack[stack.length - 1].children.push(node);
			continue;
		}
		if (stack.length < 2) return null;
		const complete = stack.pop()!;
		stack[stack.length - 1].children.push({
			...layout.nodes[complete.index],
			content: complete.children,
		});
	}
	addText(unescapeText(translated.slice(cursor)));
	if (stack.length !== 1 || used.size !== layout.nodes.length) return null;
	return root;
}

export function composeTranslatedContent(
	translated: string,
	layout: TranslationLayout,
	original: MessageNode[],
	options: { showLanguage: boolean; showOriginal: boolean; language: string },
) {
	const content = restoreTranslatedContent(translated, layout);
	if (!content) return null;
	if (options.showLanguage || options.showOriginal) {
		content.push({
			type: "br",
		});
		content.push({
			type: "subtext",
			content: [{
				type: "text",
				content: options.showOriginal
					? `Translated from ${options.language}. Original:`
					: `Translated from ${options.language}`,
			}],
		});
	}
	if (options.showOriginal) {
		if (layout.nodes.some((node) => node.type === "blockQuote" || node.type === "codeBlock")) {
			content.push({ type: "br" }, ...original);
		} else {
			content.push({ type: "blockQuote", content: original });
		}
	}
	return content;
}