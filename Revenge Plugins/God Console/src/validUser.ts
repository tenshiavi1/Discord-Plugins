import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "../../compat";
import { messageMentionIds } from "./validUserCore";

const messageEvents = [
	"MESSAGE_CREATE",
	"MESSAGE_UPDATE",
	"LOAD_MESSAGES_SUCCESS",
	"LOAD_MESSAGES_AROUND_SUCCESS",
	"LOCAL_MESSAGES_LOADED",
	"CHANNEL_SELECT",
];

type WaitingMessage = {
	channelId: string;
	messageId: string;
	message: Record<string, any>;
	userIds: string[];
};

const inFlightUsers = new Map<string, Promise<boolean>>();
const retryAfter = new Map<string, number>();
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const unavailableUsers = new Set<string>();
const waitingMessages = new Map<string, WaitingMessage>();
const refreshingMessages = new Set<string>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let enabled = false;
let dispatcher: any;
let userStore: any;
let retryTimer: ReturnType<typeof setInterval> | undefined;

function getDispatcher() {
	const candidate = findByProps("dispatch", "subscribe", "unsubscribe") ?? FluxDispatcher;
	return typeof candidate?.dispatch === "function"
		&& typeof candidate?.subscribe === "function"
		&& typeof candidate?.unsubscribe === "function"
		? candidate
		: undefined;
}

function getUserStore() {
	userStore ??= findByStoreName("UserStore") ?? findByProps("getUser", "getCurrentUser");
	return userStore;
}

function isCached(userId: string): boolean {
	try {
		return Boolean(getUserStore()?.getUser?.(userId));
	} catch (error) {
		console.warn("[God Console] Could not check the user cache.", error);
		return false;
	}
}

function rememberFailure(userId: string, error?: any) {
	const status = error?.status ?? error?.response?.status;
	const code = error?.body?.code ?? error?.response?.body?.code;
	if (status === 429) {
		const retry = Number(error?.body?.retry_after ?? error?.response?.body?.retry_after);
		const delay = Number.isFinite(retry) && retry > 0
			? Math.min(300_000, Math.max(1_000, retry > 60 ? retry : retry * 1000))
			: 5_000;
		retryAfter.set(userId, Date.now() + delay);
	} else if (status === 404 || code === 10013) {
		unavailableUsers.add(userId);
		retryAfter.delete(userId);
		for (const [key, entry] of waitingMessages) {
			if (!entry.userIds.includes(userId)) continue;
			entry.userIds = entry.userIds.filter((id) => id !== userId);
			if (!entry.userIds.length) waitingMessages.delete(key);
		}
		refreshReadyMessages();
	} else {
		retryAfter.set(userId, Date.now() + 30_000);
	}
	if (status === 404 || code === 10013) return;
	const previousTimer = retryTimers.get(userId);
	if (previousTimer) clearTimeout(previousTimer);
	const delay = Math.max(0, (retryAfter.get(userId) ?? Date.now()) - Date.now());
	retryTimers.set(userId, setTimeout(() => {
		retryTimers.delete(userId);
		if (!enabled || isCached(userId)) return;
		retryAfter.delete(userId);
		void resolveUser(userId).then(refreshReadyMessages);
	}, delay));
}

async function fetchAndDispatchUser(userId: string): Promise<boolean> {
	if (!enabled || isCached(userId)) return isCached(userId);
	const userUtils = findByProps("fetchUser");
	if (typeof userUtils?.fetchUser === "function") {
		try {
			await userUtils.fetchUser(userId);
			if (isCached(userId)) return true;
		} catch (error) {
			console.warn(`[God Console] Client user lookup failed for ${userId}.`, error);
		}
	}
	if (!enabled) return false;

	const restApi = findByProps("get", "post", "del", "patch") ?? findByProps("get");
	if (typeof restApi?.get !== "function") {
		console.error("[God Console] Discord's user lookup API is unavailable.");
		return false;
	}
	try {
		const response = await restApi.get({ url: `/users/${userId}` });
		const user = response?.body ?? response;
		if (!enabled || (response?.status != null && (response.status < 200 || response.status >= 300))
			|| typeof user?.id !== "string" || user.id !== userId) {
			if (enabled) rememberFailure(userId, response);
			return false;
		}
		const activeDispatcher = getDispatcher();
		if (typeof activeDispatcher?.dispatch !== "function") {
			console.error("[God Console] Discord's dispatcher is unavailable; the resolved user cannot be cached.");
			return false;
		}
		activeDispatcher.dispatch({ type: "USER_UPDATE", user });
		retryAfter.delete(userId);
		return isCached(userId);
	} catch (error) {
		rememberFailure(userId, error);
		console.warn(`[God Console] Could not resolve mentioned user ${userId}.`, error);
		return false;
	}
}

function resolveUser(userId: string): Promise<boolean> {
	if (!enabled || isCached(userId)) return Promise.resolve(isCached(userId));
	const pending = inFlightUsers.get(userId);
	if (pending) return pending;
	if ((retryAfter.get(userId) ?? 0) > Date.now()) return Promise.resolve(false);

	const request = requestQueue.then(async () => {
		if (!enabled || isCached(userId)) return isCached(userId);
		if ((retryAfter.get(userId) ?? 0) > Date.now()) return false;
		const wait = Math.max(0, 300 - (Date.now() - lastRequestAt));
		if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
		if (!enabled) return false;
		lastRequestAt = Date.now();
		return fetchAndDispatchUser(userId);
	});
	requestQueue = request.then(() => undefined, () => undefined);
	inFlightUsers.set(userId, request);
	void request.then(
		() => inFlightUsers.delete(userId),
		() => inFlightUsers.delete(userId),
	);
	return request;
}

function getMessageList(value: unknown): any[] {
	if (Array.isArray(value)) return value;
	const array = (value as { _array?: unknown[] } | null)?._array;
	return Array.isArray(array) ? array : [];
}

function redrawMessage(entry: WaitingMessage) {
	const key = `${entry.channelId}:${entry.messageId}`;
	if (!dispatcher || refreshingMessages.has(key)) return;
	const messageStore = findByStoreName("MessageStore") ?? findByProps("getMessage", "getMessages");
	const current = messageStore?.getMessage?.(entry.channelId, entry.messageId) ?? entry.message;
	if (!current || typeof current !== "object") return;
	const channelId = current.channel_id ?? current.channelId ?? entry.channelId;
	const content = typeof current.content === "string" ? current.content : "";
	const temporary = { ...current, channel_id: channelId, content: `${content}\u200b` };
	const restored = { ...current, channel_id: channelId, content };
	refreshingMessages.add(key);
	try {
		dispatcher.dispatch({ type: "MESSAGE_UPDATE", message: temporary, otherPluginBypass: true });
		setTimeout(() => {
			try {
				dispatcher?.dispatch({ type: "MESSAGE_UPDATE", message: restored, otherPluginBypass: true });
			} catch (error) {
				console.warn("[God Console] Could not refresh a resolved mention.", error);
			} finally {
				refreshingMessages.delete(key);
			}
		}, 120);
	} catch (error) {
		refreshingMessages.delete(key);
		console.warn("[God Console] Could not refresh a resolved mention.", error);
	}
}

function refreshReadyMessages() {
	for (const [key, entry] of waitingMessages) {
		if (!entry.userIds.every(isCached)) continue;
		waitingMessages.delete(key);
		redrawMessage(entry);
	}
}

function processMessage(message: any, channelId?: unknown) {
	const id = String(message?.id ?? "");
	const messageChannel = String(message?.channel_id ?? message?.channelId ?? channelId ?? "");
	if (!id || !messageChannel) return;
	const key = `${messageChannel}:${id}`;
	if (refreshingMessages.has(key)) return;
	const userIds = [...messageMentionIds(message)];
	if (!userIds.length) {
		waitingMessages.delete(key);
		return;
	}
	const unresolved = userIds.filter((userId) => !isCached(userId) && !unavailableUsers.has(userId));
	if (!unresolved.length) {
		waitingMessages.delete(key);
		return;
	}

	waitingMessages.set(key, { channelId: messageChannel, messageId: id, message, userIds });
	void Promise.all(unresolved.map(resolveUser)).then(refreshReadyMessages);
}

function handleMessageEvent(event: any) {
	if (!enabled || !event) return;
	if (event.type === "CHANNEL_SELECT") {
		const channelId = event.channelId ?? event.channel_id
			?? (findByStoreName("SelectedChannelStore") ?? findByProps("getChannelId"))?.getChannelId?.();
		if (typeof channelId === "string") {
			const messageStore = findByStoreName("MessageStore") ?? findByProps("getMessage", "getMessages");
			for (const message of getMessageList(messageStore?.getMessages?.(channelId))) processMessage(message, channelId);
		}
	}
	const fallbackChannel = event.channelId ?? event.channel_id;
	if (event.message) processMessage(event.message, fallbackChannel);
	for (const message of getMessageList(event.messages)) processMessage(message, fallbackChannel);
}

function clearRuntimeState() {
	waitingMessages.clear();
	inFlightUsers.clear();
	retryAfter.clear();
	unavailableUsers.clear();
	for (const timer of retryTimers.values()) clearTimeout(timer);
	retryTimers.clear();
	refreshingMessages.clear();
}

function stopMentionDiscovery() {
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = undefined;
	if (dispatcher) {
		for (const event of messageEvents) dispatcher.unsubscribe(event, handleMessageEvent);
		dispatcher.unsubscribe("LOGOUT", clearRuntimeState);
	}
	dispatcher = undefined;
}

function installMentionListeners() {
	if (!enabled) return false;
	const candidate = getDispatcher();
	if (!candidate) return false;
	if (dispatcher === candidate) return true;
	stopMentionDiscovery();
	dispatcher = candidate;
	for (const event of messageEvents) dispatcher.subscribe(event, handleMessageEvent);
	dispatcher.subscribe("LOGOUT", clearRuntimeState);
	handleMessageEvent({ type: "CHANNEL_SELECT" });
	return true;
}

export function setValidUserEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (enabled) {
		getUserStore();
		installMentionListeners();
		retryTimer = setInterval(installMentionListeners, 5000);
		return;
	}
	stopMentionDiscovery();
	clearRuntimeState();
}
