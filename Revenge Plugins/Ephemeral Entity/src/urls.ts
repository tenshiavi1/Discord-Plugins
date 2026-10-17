const TRACKING_PARAMETERS = new Set([
	"__hsfp",
	"__hssc",
	"__hstc",
	"__s",
	"_ga",
	"_gl",
	"_hsenc",
	"_hsmi",
	"campaign",
	"campaign_id",
	"ck_subscriber_id",
	"dclid",
	"fb_action_ids",
	"fb_action_types",
	"fb_ref",
	"fb_source",
	"fbclid",
	"gbraid",
	"gclsrc",
	"gclid",
	"igshid",
	"mc_cid",
	"mc_eid",
	"mkt_tok",
	"msclkid",
	"oly_anon_id",
	"oly_enc_id",
	"rb_clickid",
	"ref_src",
	"ref_url",
	"s_cid",
	"spm",
	"twclid",
	"vero_conv",
	"vero_id",
	"wbraid",
	"yclid",
	"ymclid",
]);

const TRAILING_PUNCTUATION = /[.,!?;:]+$/;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;

export function isTrackingParameter(parameter: string): boolean {
	const normalized = parameter.toLowerCase();
	return normalized.startsWith("utm_")
		|| TRACKING_PARAMETERS.has(normalized);
}

export function clearTrackingUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return value;
	}

	const host = url.hostname.toLowerCase();
	let removedParameter = false;
	for (const parameter of Array.from(url.searchParams.keys())) {
		const normalized = parameter.toLowerCase();
		const amazonReferral = /(^|\.)amazon\.[a-z.]+$/i.test(host)
			&& (normalized === "tag"
				|| normalized === "linkcode"
				|| normalized === "camp"
				|| normalized === "creative"
				|| normalized === "creativeasin"
				|| normalized === "ascsubtag"
				|| normalized === "ref"
				|| normalized.startsWith("ref_")
				|| normalized.startsWith("pd_rd_")
				|| normalized.startsWith("pf_rd_")
				|| normalized === "qid");
		const youtubeShare = /(^|\.)youtube\.com$/i.test(host) || host === "youtu.be";

		if (isTrackingParameter(normalized) || amazonReferral || (youtubeShare && normalized === "si")) {
			url.searchParams.delete(parameter);
			removedParameter = true;
		}
	}

	return removedParameter ? url.toString() : value;
}

function splitTrailingPunctuation(value: string): [string, string] {
	let end = value.length;
	while (end > 0 && /[.,!?;:]/.test(value[end - 1])) end--;

	while (end > 0 && (value[end - 1] === ")" || value[end - 1] === "]" || value[end - 1] === "}")) {
		const closing = value[end - 1];
		const opening = closing === ")" ? "(" : closing === "]" ? "[" : "{";
		const prefix = value.slice(0, end);
		const openCount = [...prefix].filter((character) => character === opening).length;
		const closeCount = [...prefix].filter((character) => character === closing).length;
		if (closeCount <= openCount) break;
		end--;
	}

	return [value.slice(0, end), value.slice(end)];
}

export function clearTrackingUrlsInText(content: string): string {
	return content.replace(URL_PATTERN, (match) => {
		const [candidate, suffix] = splitTrailingPunctuation(match);
		return `${clearTrackingUrl(candidate)}${suffix}`;
	});
}

export function clearTrackingUrlsInMessage<T>(message: T): T {
	if (!message || typeof message !== "object") return message;
	const candidate = message as T & { content?: unknown };
	if (typeof candidate.content !== "string") return message;

	const content = clearTrackingUrlsInText(candidate.content);
	return content === candidate.content ? message : { ...candidate, content };
}
