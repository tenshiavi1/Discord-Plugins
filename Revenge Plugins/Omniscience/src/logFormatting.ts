export function parseChannelId(value: string): string | undefined {
	const input = value.trim();
	if (/^\d{17,20}$/.test(input)) return input;

	try {
		const url = new URL(input);
		if (!["discord.com", "discordapp.com"].includes(url.hostname)) return undefined;
		const match = /^\/channels\/(?:@me|\d+)\/(\d+)(?:\/|$)/.exec(url.pathname);
		return match?.[1];
	} catch {
		return undefined;
	}
}

export function parseDiscordWebhookUrl(value: string): string | undefined {
	try {
		const url = new URL(value.trim());
	if (url.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(url.hostname)) return undefined;
	if (!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)) return undefined;
	return url.toString();
	} catch {
		return undefined;
	}
}

export function toDiscordTimestamp(value: string | number | Date): string | undefined {
	const date = value instanceof Date ? value : new Date(value);
	const timestamp = date.getTime();
	if (!Number.isFinite(timestamp)) return undefined;
	return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

export function toEmbedTimestamp(value: string | number | Date): string | undefined {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function underlineFirstMatch(content: string, keyword: string, caseSensitive: boolean): string {
	if (!keyword) return content;
	const source = caseSensitive ? content : content.toLocaleLowerCase();
	const target = caseSensitive ? keyword : keyword.toLocaleLowerCase();
	const index = source.indexOf(target);
	if (index < 0) return content;
	return `${content.slice(0, index)}__${content.slice(index, index + keyword.length)}__${content.slice(index + keyword.length)}`;
}

export function limitEmbedField(value: string, maxLength = 1024): string {
	if (value.length <= maxLength) return value || "(no text)";
	return `${value.slice(0, maxLength - 3)}...`;
}

export function linkedEmbedField(value: string, url: string, maxLength = 1024): string {
	const link = `\n[Open message](${url})`;
	return `${limitEmbedField(value, Math.max(1, maxLength - link.length))}${link}`;
}