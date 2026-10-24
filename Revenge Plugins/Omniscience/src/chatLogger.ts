import { findByProps } from "../../compat";
import { storage } from "@vendetta/plugin";
import { toEmbedTimestamp } from "./logFormatting";
import { getEditedMessageUpdate, isEphemeralMessage, resolveDeletedMessageSource } from "./messageHistoryPresentation";

const FluxDispatcher = findByProps("dispatch", "subscribe", "unsubscribe");
const snowflakeUtils = findByProps("extractTimestamp");
const MAX_CACHED_MESSAGES = 500;
const MAX_DELETED_MESSAGES = 5000;
const MESSAGE_LOG_LIMITS = [100, 512, 1000, MAX_DELETED_MESSAGES];
const MESSAGE_HISTORY_CLEANUP_KEY = "__omniscienceMessageHistoryCleanup";
const globalHistoryState = globalThis as typeof globalThis & {
  [MESSAGE_HISTORY_CLEANUP_KEY]?: () => void;
};

type CachedMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  attachments: string[];
  embeds: string[];
  timestamp: string;
  flags?: number;
  state?: string;
};

type DeletedMessage = CachedMessage & { deletedAt: string };

for (const [key, value] of Object.entries({
  messageLoggerKeepAfterRestart: false,
  messageLoggerLimit: 512,
  messageLoggerCache: [],
  messageLoggerDeletedCache: [],
})) {
  if (storage[key] === undefined) storage[key] = value;
}

function readMessageCache(value: unknown): CachedMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry: unknown): entry is CachedMessage =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as CachedMessage).id === "string" &&
        typeof (entry as CachedMessage).channelId === "string" &&
        typeof (entry as CachedMessage).content === "string" &&
        Array.isArray((entry as CachedMessage).attachments),
    )
    .map((entry) => ({ ...entry }))
    .slice(-MAX_CACHED_MESSAGES);
}

function readDeletedCache(value: unknown): DeletedMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry: unknown): entry is DeletedMessage =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as DeletedMessage).id === "string" &&
        typeof (entry as DeletedMessage).channelId === "string" &&
        typeof (entry as DeletedMessage).content === "string" &&
        typeof (entry as DeletedMessage).deletedAt === "string" &&
        Array.isArray((entry as DeletedMessage).attachments),
    )
    .map((entry) => ({ ...entry }));
}

let cachedMessages = storage.messageLoggerKeepAfterRestart
  ? readMessageCache(storage.messageLoggerCache)
  : [];
let deletedMessages = storage.messageLoggerKeepAfterRestart
  ? readDeletedCache(storage.messageLoggerDeletedCache).slice(
      -getMessageLogLimit(),
    )
  : [];

function getMessageLogLimit() {
  const configured = Number(storage.messageLoggerLimit);
  return MESSAGE_LOG_LIMITS.includes(configured) ? configured : 512;
}

function persistMessageHistory() {
  const keepAfterRestart = Boolean(storage.messageLoggerKeepAfterRestart);
  storage.messageLoggerCache = keepAfterRestart ? cachedMessages : [];
  storage.messageLoggerDeletedCache = keepAfterRestart ? deletedMessages : [];
  storage.messageLoggerDeletedCount = deletedMessages.length;
}

persistMessageHistory();

function getCache(): CachedMessage[] {
  return cachedMessages;
}

function getMessageKey(channelId: string, messageId: string) {
  return `${channelId}:${messageId}`;
}

function rememberMessage(message: CachedMessage) {
  const key = getMessageKey(message.channelId, message.id);
  const messages = getCache().filter(
    (entry) => getMessageKey(entry.channelId, entry.id) !== key,
  );
  cachedMessages = [...messages, message].slice(-MAX_CACHED_MESSAGES);
  persistMessageHistory();
}

function findCachedMessage(channelId: string, messageId: string) {
  return getCache().find(
    (entry) => entry.channelId === channelId && entry.id === messageId,
  );
}

function removeCachedMessage(channelId: string, messageId: string) {
  cachedMessages = getCache().filter(
    (entry) => entry.channelId !== channelId || entry.id !== messageId,
  );
  persistMessageHistory();
}

export function clearMessageLoggerCache() {
  cachedMessages = [];
  persistMessageHistory();
}

export function setMessageLoggerKeepAfterRestart(enabled: boolean) {
  storage.messageLoggerKeepAfterRestart = enabled;
  persistMessageHistory();
}

export function setMessageLoggerLimit(limit: number) {
  storage.messageLoggerLimit = MESSAGE_LOG_LIMITS.includes(limit) ? limit : 512;
  deletedMessages = deletedMessages.slice(-getMessageLogLimit());
  persistMessageHistory();
}

export function clearDeletedMessageHistory() {
  for (const message of deletedMessages) {
    try {
      FluxDispatcher.dispatch({
        type: "MESSAGE_DELETE",
        channelId: message.channelId,
        id: message.id,
        otherPluginBypass: true,
      });
    } catch (error) {
      console.error(
        "[Omniscience] Could not remove a retained deleted message from chat.",
        error,
      );
    }
  }
  cachedMessages = [];
  deletedMessages = [];
  persistMessageHistory();
}

export function forgetDeletedMessage(channelId: string, messageId: string) {
  deletedMessages = deletedMessages.filter(
    (message) => message.channelId !== channelId || message.id !== messageId,
  );
  persistMessageHistory();
}

function getMessageDate(message: any, fallback = Date.now()): Date {
  const source = message?.edited_timestamp ?? message?.editedTimestamp ?? message?.timestamp;
  const parsed = source === undefined ? Number.NaN : new Date(source).getTime();
  if (Number.isFinite(parsed)) return new Date(parsed);
  if (
    typeof message?.id === "string" &&
    typeof snowflakeUtils?.extractTimestamp === "function"
  ) {
    try {
      const extracted = snowflakeUtils.extractTimestamp(message.id);
      const timestamp =
        extracted instanceof Date
          ? extracted.getTime()
          : typeof extracted === "number"
            ? extracted
            : typeof extracted === "string"
              ? Date.parse(extracted)
              : Number.NaN;
      if (Number.isFinite(timestamp)) return new Date(timestamp);
    } catch (error) {
      console.warn("[Omniscience] Could not read a message timestamp.", error);
    }
  }
  return new Date(fallback);
}

function getAttachments(message: any): string[] {
  if (!Array.isArray(message?.attachments)) return [];
  return message.attachments.flatMap((attachment: any) => {
    const url =
      typeof attachment?.url === "string"
        ? attachment.url
        : attachment?.proxy_url;
    if (typeof url !== "string") return [];
    return [
      typeof attachment.filename === "string"
        ? `${attachment.filename}: ${url}`
        : url,
    ];
  });
}

function getEmbedText(message: any): string[] {
  if (!Array.isArray(message?.embeds)) return [];
  return message.embeds.flatMap((embed: any) =>
    [
      embed?.title,
      embed?.description,
      ...(Array.isArray(embed?.fields)
        ? embed.fields.flatMap((field: any) => [field?.name, field?.value])
        : []),
    ].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    ),
  );
}

function getMessageContent(message: any, previous?: CachedMessage): string {
  const content =
    typeof message?.content === "string"
      ? message.content
      : (previous?.content ?? "");
  const attachments = Array.isArray(message?.attachments)
    ? getAttachments(message)
    : (previous?.attachments ?? []);
  const embeds = Array.isArray(message?.embeds)
    ? getEmbedText(message)
    : (previous?.embeds ?? []);
  return [content, ...attachments, ...embeds].filter(Boolean).join("\n");
}

function getAuthorName(message: any, previous?: CachedMessage): string {
  return typeof message?.author?.username === "string"
    ? message.author.username
    : (previous?.authorName ?? "Unknown user");
}

function makeCachedMessage(
  message: any,
  channelId: string,
  previous?: CachedMessage,
): CachedMessage {
  const date = getMessageDate(message);
  return {
    id: String(message.id ?? previous?.id ?? ""),
    channelId,
    authorId:
      typeof message.author?.id === "string"
        ? message.author.id
        : (previous?.authorId ?? ""),
    authorName: getAuthorName(message, previous),
    content:
      typeof message.content === "string"
        ? message.content
        : (previous?.content ?? ""),
    attachments: Array.isArray(message.attachments)
      ? getAttachments(message)
      : (previous?.attachments ?? []),
    embeds: Array.isArray(message.embeds)
      ? getEmbedText(message)
      : (previous?.embeds ?? []),
    timestamp: toEmbedTimestamp(date) ?? new Date().toISOString(),
    flags: Number(message.flags) || 0,
    ...(typeof message.state === "string" ? { state: message.state } : {}),
  };
}

function onMessageCreate(event: any) {
  if (storage.enabled === false || event?.otherPluginBypass) return;
  const message = event?.message ?? event;
  if (!message || typeof message.id !== "string" || isEphemeralMessage(message)) return;
  const channelId = String(
    message.channel_id ??
      message.channelId ??
      event?.channel_id ??
      event?.channelId ??
      "",
  );
  if (!channelId) return;

  if (storage.keepDeletedMessages === false) return;
  rememberMessage(makeCachedMessage(message, channelId));
}

function onMessageUpdate(event: any) {
  if (
    storage.enabled === false ||
    storage.keepDeletedMessages === false ||
    event?.otherPluginBypass
  )
    return;
  const message = getEditedMessageUpdate(event);
  if (!message) return;
  const channelId = String(
    message?.channel_id ?? message?.channelId ?? event?.channel_id ?? event?.channelId ?? "",
  );
  const messageId = String(message?.id ?? event?.id ?? "");
  if (!channelId || !messageId) return;

  const cached = findCachedMessage(channelId, messageId);
  if (cached && isEphemeralMessage(cached)) return;
  const nextContent = getMessageContent(message, cached);
  const originalContent = cached
    ? [cached.content, ...cached.attachments, ...cached.embeds]
        .filter(Boolean)
        .join("\n")
    : "";
  if (cached && nextContent !== originalContent) {
    rememberMessage(makeCachedMessage(message, channelId, cached));
    return;
  }
  rememberMessage(makeCachedMessage(message, channelId, cached));
}

export function recordMessageUpdate(event: any) {
  onMessageUpdate(event);
}

function onMessageDelete(event: any, fallbackMessage?: any) {
  if (
    storage.enabled === false ||
    storage.keepDeletedMessages === false ||
    event?.otherPluginBypass
  )
    return;
  const channelId = String(event?.channelId ?? event?.channel_id ?? "");
  const messageId = String(event?.id ?? "");
  if (!channelId || !messageId) return;
  const cached = findCachedMessage(channelId, messageId);
  const fallback = fallbackMessage
    ? makeCachedMessage(fallbackMessage, channelId, cached)
    : undefined;
  const source = resolveDeletedMessageSource(cached, fallback);
  if (!source) return;

  const deletedEntry = { ...source, deletedAt: new Date().toISOString() };
  deletedMessages = [
    ...deletedMessages.filter(
      (entry) =>
        getMessageKey(entry.channelId, entry.id) !==
        getMessageKey(channelId, messageId),
    ),
    deletedEntry,
  ].slice(-getMessageLogLimit());
  persistMessageHistory();
  removeCachedMessage(channelId, messageId);
}

export function recordMessageDelete(event: any, fallbackMessage?: any) {
  onMessageDelete(event, fallbackMessage);
}

function onMessageDeleteBulk(event: any) {
  if (event?.otherPluginBypass || !Array.isArray(event?.ids)) return;
  const channelId = event.channelId ?? event.channel_id;
  for (const id of event.ids) onMessageDelete({ channelId, id });
}

export function installChatLogger(): () => void {
  if (
    typeof FluxDispatcher?.subscribe !== "function" ||
    typeof FluxDispatcher?.unsubscribe !== "function"
  ) {
    console.warn(
      "[Omniscience] Discord's message dispatcher was not found; chat logging is unavailable.",
    );
    return () => {};
  }
  globalHistoryState[MESSAGE_HISTORY_CLEANUP_KEY]?.();

  const subscriptions = [
    ["MESSAGE_CREATE", onMessageCreate],
    ["MESSAGE_DELETE_BULK", onMessageDeleteBulk],
  ] as const;
  for (const [event, listener] of subscriptions)
    FluxDispatcher.subscribe(event, listener);

  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    for (const [event, listener] of subscriptions)
      FluxDispatcher.unsubscribe(event, listener);
    if (globalHistoryState[MESSAGE_HISTORY_CLEANUP_KEY] === cleanup) {
      delete globalHistoryState[MESSAGE_HISTORY_CLEANUP_KEY];
    }
  };

  globalHistoryState[MESSAGE_HISTORY_CLEANUP_KEY] = cleanup;
  return cleanup;
}
