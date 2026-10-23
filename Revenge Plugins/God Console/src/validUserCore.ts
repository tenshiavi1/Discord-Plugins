const mentionPattern = /<@!?([0-9]{17,20})>/g;

export function extractMentionIds(value: unknown, ids = new Set<string>(), seen = new WeakSet<object>(), depth = 0) {
	if (depth > 12 || value == null) return ids;
	if (typeof value === "string") {
		mentionPattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = mentionPattern.exec(value))) ids.add(match[1]);
		return ids;
	}
	if (typeof value !== "object" || seen.has(value)) return ids;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const child of value) extractMentionIds(child, ids, seen, depth + 1);
		return ids;
	}
	for (const child of Object.values(value)) extractMentionIds(child, ids, seen, depth + 1);
	return ids;
}

export function messageMentionIds(message: unknown) {
	return extractMentionIds(message);
}
