import { FluxDispatcher } from "@vendetta/metro/common";
import { findByProps, findByStoreName } from "../../compat";

const mentionPattern = /<@!?([0-9]{17,20})>/g;
const messageEvents = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES"];
const maxPendingUsers = 100;
const maxUsersPerMessage = 10;
const maxInitialMessages = 50;
const inFlightUsers = new Map<string, Promise<boolean>>();
const retryAfter = new Map<string, number>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let enabled = false;
let dispatcher: any;
let channelMessages: any;
const eventHandlers = new Map<string, (payload: any) => void>();

function isCached(userId: string): boolean {
	return Boolean(findByStoreName("UserStore")?.getUser?.(userId));
}

function extractMentionIds(message: any): string[] {
	const texts: string[] = [];
	if (typeof message?.content === "string") texts.push(message.content);
	for (const embed of Array.isArray(message?.embeds) ? message.embeds : []) {
		for (const value of [embed?.rawTitle, embed?.rawDescription, embed?.title, embed?.description]) {
			if (typeof value === "string") texts.push(value);
		}
		for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
			for (const value of [field?.rawName, field?.rawValue, field?.name, field?.value]) {
				if (typeof value === "string") texts.push(value);
			}
		}
	}
	const pendingComponents = Array.isArray(message?.components) ? [...message.components] : [];
	let inspectedComponents = 0;
	while (pendingComponents.length > 0 && inspectedComponents < 1000) {
		const component = pendingComponents.pop();
		inspectedComponents++;
		if (typeof component?.content === "string") texts.push(component.content);
		if (Array.isArray(component?.components)) pendingComponents.push(...component.components);
	}
	for (const snapshot of Array.isArray(message?.messageSnapshots) ? message.messageSnapshots : []) {
		if (typeof snapshot?.message?.content === "string") texts.push(snapshot.message.content);
	}

	const ids = new Set<string>();
	for (const text of texts) {
		for (const match of text.matchAll(mentionPattern)) ids.add(match[1]);
	}
	return [...ids];
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
		retryAfter.set(userId, Date.now() + 15 * 60_000);
	} else {
		retryAfter.set(userId, Date.now() + 30_000);
	}
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
	if (typeof restApi?.get !== "function" || typeof dispatcher?.dispatch !== "function") return false;
	try {
		const response = await restApi.get({ url: `/users/${userId}` });
		const user = response?.body;
		if (!enabled || response?.status !== 200 || typeof user?.id !== "string" || user.id !== userId) {
			if (enabled) rememberFailure(userId, response);
			return false;
		}
		dispatcher.dispatch({ type: "USER_UPDATE", user });
		retryAfter.delete(userId);
		return true;
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
	if (inFlightUsers.size >= maxPendingUsers) return Promise.resolve(false);
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

function collectMessages(value: any, depth = 0): any[] {
	if (depth > 3 || value == null) return [];
	if (Array.isArray(value)) return value.flatMap((item) => collectMessages(item, depth + 1));
	if (value instanceof Map) return collectMessages([...value.values()], depth + 1);
	if (typeof value?.toArray === "function") {
		try {
			return collectMessages(value.toArray(), depth + 1);
		} catch {
			return [];
		}
	}
	if (typeof value?.valueSeq === "function") {
		try {
			return collectMessages(value.valueSeq().toArray(), depth + 1);
		} catch {
			return [];
		}
	}
	if (Array.isArray(value?._array)) return collectMessages(value._array, depth + 1);
	if (value && typeof value === "object" && (
		typeof value.content === "string" ||
		Array.isArray(value.embeds) ||
		Array.isArray(value.components)
	)) {
		return [value];
	}
	if (typeof value === "object") return Object.values(value).flatMap((item) => collectMessages(item, depth + 1));
	return [];
}

function processMessage(message: any) {
	if (!enabled || !message || typeof message !== "object") return;
	for (const userId of extractMentionIds(message).slice(0, maxUsersPerMessage)) {
		if (!isCached(userId)) void resolveUser(userId);
	}
}

function processEvent(payload: any) {
	if (!enabled || !payload || typeof payload !== "object") return;
	if (payload.message && typeof payload.message === "object") processMessage(payload.message);
	else if (payload.messages != null) {
		for (const message of collectMessages(payload.messages)) processMessage(message);
	}
}

function processCurrentChannel() {
	const channelId = findByStoreName("SelectedChannelStore")?.getChannelId?.();
	if (typeof channelId !== "string") return;
	const messageStore = findByStoreName("MessageStore");
	const stored = channelMessages?._channelMessages?.get?.(channelId);
	const messages = collectMessages(stored ?? messageStore?.getMessages?.(channelId));
	for (const message of messages.slice(-maxInitialMessages)) processMessage(message);
}

function installListeners() {
	dispatcher = FluxDispatcher;
	if (typeof dispatcher?.subscribe !== "function" || typeof dispatcher?.unsubscribe !== "function") {
		console.warn("[God Console] Discord's message dispatcher was not found; automatic mention repair is unavailable.");
		return;
	}
	channelMessages = findByProps("_channelMessages");
	for (const eventName of messageEvents) {
		const handler = (payload: any) => processEvent(payload);
		dispatcher.subscribe(eventName, handler);
		eventHandlers.set(eventName, handler);
	}
	processCurrentChannel();
}

function removeListeners() {
	for (const [eventName, handler] of eventHandlers) {
		try {
			dispatcher?.unsubscribe?.(eventName, handler);
		} catch (error) {
			console.warn(`[God Console] Could not unsubscribe from ${eventName}.`, error);
		}
	}
	eventHandlers.clear();
	dispatcher = undefined;
	channelMessages = undefined;
}

export function setValidUserEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (enabled) {
		installListeners();
		return;
	}
	removeListeners();
	inFlightUsers.clear();
	retryAfter.clear();
}