import { ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findByName, findByProps } from "../../compat";
import { getMessageEditHistory, isRetainedDeletedMessage } from "./messageHistory";
import { getDeletedMessageHighlight, prependEditHistory } from "./messageHistoryPresentation";

type HighlightColor = string;
type HighlightOptions = {
	enabled: boolean;
	deletedEnabled: boolean;
	historyEnabled: boolean;
	thickness: number;
	pingColor: HighlightColor;
	deletedColor: HighlightColor;
};

const COLORS: Record<string, string> = {
	default: "",
	yellow: "#f0b232",
	blurple: "#5865f2",
	green: "#23a55a",
	cyan: "#00a8fc",
	pink: "#eb459e",
	purple: "#9b59b6",
	orange: "#e67e22",
	red: "#f23f43",
};
const MAX_REMEMBERED_ROWS = 80;
const FluxDispatcher = findByProps("dispatch");
const UserStore = findByProps("getCurrentUser");
const rememberedRows = new Map<string, { channelId: string; message: any }>();
let options: HighlightOptions = {
	enabled: false,
	deletedEnabled: false,
	historyEnabled: false,
	thickness: 2,
	pingColor: "default",
	deletedColor: "default",
};
let unpatch: (() => void) | undefined;

function normalizeColor(value: string, fallback: string) {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
	return COLORS[normalized] || fallback;
}

function processedColor(value: string) {
	if (typeof RN.processColor !== "function") return undefined;
	const result = RN.processColor(value);
	return typeof result === "number" ? result : undefined;
}

function encodeGutter(color: number, thickness: number) {
	const scale = Math.max(1, Math.min(4, Math.floor(Number(thickness) || 1)));
	return scale === 1 ? color : ((256 - scale) << 24) | (color & 0x00ffffff);
}

function isMentionForCurrentUser(source: any, message: any) {
	if (source?.mentioned || message?.mentioned || source?.mention_everyone || source?.mentionEveryone) return true;
	const mentions = source?.mentions;
	const reference = source?.referenced_message ?? source?.referencedMessage?.message;
	const referencedAuthor = reference?.author?.id;
	if (!Array.isArray(mentions) && !referencedAuthor) return false;
	const currentUserId = UserStore?.getCurrentUser?.()?.id;
	if (typeof currentUserId !== "string" || !currentUserId) return false;
	if (referencedAuthor === currentUserId) return true;
	return Array.isArray(mentions) && mentions.some((user: any) => user === currentUserId || user?.id === currentUserId);
}

function rememberRow(channelId: string, message: any) {
	const key = `${channelId}:${message.id}`;
	rememberedRows.delete(key);
	rememberedRows.set(key, { channelId, message });
	if (rememberedRows.size > MAX_REMEMBERED_ROWS) rememberedRows.delete(rememberedRows.keys().next().value);
}

function highlightRow(args: any[], result: any) {
	if (!result?.message) return result;
	const row = args[0];
	if (!row || row.rowType !== 1) return result;
	const source = row.message ?? result.message;
	const message = result.message;
	const channelId = String(source.channel_id ?? source.channelId ?? message.channel_id ?? message.channelId ?? "");
	const messageId = String(source.id ?? message.id ?? "");
	if (!channelId || !messageId) return result;
	let next = result;
	if (options.historyEnabled) {
		const content = prependEditHistory(message.content, getMessageEditHistory(channelId, messageId));
		if (content !== message.content) {
			next = { ...next, message: { ...message, content } };
			rememberRow(channelId, source);
		}
	}
	if (!options.enabled) return next;

	const deleted = options.deletedEnabled && (isRetainedDeletedMessage(channelId, messageId) || Boolean(message.was_deleted));
	const mentioned = options.enabled && !deleted && isMentionForCurrentUser(source, message);
	if (!deleted && !mentioned) return next;

	const deletedHighlight = deleted
		? getDeletedMessageHighlight(options.enabled, normalizeColor(options.deletedColor, "#f23f43"), options.thickness)
		: undefined;
	const color = deletedHighlight?.color ?? normalizeColor(options.pingColor, "#f0b232");
	const gutter = processedColor(color);
	const background = processedColor(`${color}1a`);
	if (gutter === undefined || background === undefined) return next;
	rememberRow(channelId, source);
	return {
		...next,
		backgroundHighlight: {
			backgroundColor: background,
			gutterColor: encodeGutter(gutter, deletedHighlight?.thickness ?? options.thickness),
		},
	};
}

function installRowPatch() {
	const module = findByName("RowGenerator", false);
	const RowGenerator = module?.default ?? module?.RowGenerator ?? module;
	if (!RowGenerator?.prototype || typeof RowGenerator.prototype.generate !== "function") {
		console.warn("[Omniscience] Discord's message row generator was not found; message highlights are preview-only.");
		return;
	}
	unpatch = after("generate", RowGenerator.prototype, (args: any[], result: any) => highlightRow(args, result));
}

function redrawRememberedRows() {
	if (typeof FluxDispatcher?.dispatch !== "function") return;
	for (const { channelId, message } of rememberedRows.values()) {
		if (!message || typeof message.id !== "string") continue;
		const content = typeof message.content === "string" ? message.content : "";
		const update = { id: message.id, channel_id: channelId } as Record<string, unknown>;
		if (Array.isArray(message.embeds) && message.embeds.length) update.embeds = message.embeds.slice();
		if (Array.isArray(message.components) && message.components.length) update.components = message.components.slice();
		if (content) {
			FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", otherPluginBypass: true, message: { ...update, content: `${content}\u200b` } });
			setTimeout(() => FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", otherPluginBypass: true, message: { ...update, content } }), 60);
		} else {
			FluxDispatcher.dispatch({ type: "MESSAGE_UPDATE", otherPluginBypass: true, message: update });
		}
	}
}

export function setMessageHighlightOptions(next: Partial<HighlightOptions>) {
	options = {
		...options,
		...next,
		thickness: Math.max(1, Math.min(4, Math.floor(Number(next.thickness ?? options.thickness) || 1))),
	};
	if ((options.enabled || options.deletedEnabled || options.historyEnabled) && !unpatch) installRowPatch();
	if (!options.enabled && !options.deletedEnabled && !options.historyEnabled && unpatch) {
		unpatch();
		unpatch = undefined;
	}
	redrawRememberedRows();
}

export function removeMessageHighlightPatch() {
	unpatch?.();
	unpatch = undefined;
	rememberedRows.clear();
}
