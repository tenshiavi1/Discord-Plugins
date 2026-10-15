import { React } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { findByProps, findByStoreName } from "../../compat";

const mentionPattern = /<@!?([0-9]{17,20})>/;
const maxPendingUsers = 100;
const inFlightUsers = new Map<string, Promise<boolean>>();
const retryAfter = new Map<string, number>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let enabled = false;
let unpatchMention: (() => void) | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let retryCount = 0;

function isCached(userId: string): boolean {
	return Boolean(findByStoreName("UserStore")?.getUser?.(userId));
}

function extractMentionId(value: unknown, depth = 0, seen = new WeakSet<object>()): string | undefined {
	if (depth > 8 || value == null) return undefined;
	if (typeof value === "string") return value.match(mentionPattern)?.[1];
	if (typeof value !== "object" || seen.has(value)) return undefined;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const child of value) {
			const id = extractMentionId(child, depth + 1, seen);
			if (id) return id;
		}
		return undefined;
	}
	const props = value as Record<string, unknown>;
	for (const key of ["content", "children", "props", "data", "text"]) {
		const id = extractMentionId(props[key], depth + 1, seen);
		if (id) return id;
	}
	return undefined;
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
	if (typeof restApi?.get !== "function") return false;
	try {
		const response = await restApi.get({ url: `/users/${userId}` });
		const user = response?.body ?? response;
		if (!enabled || (response?.status != null && (response.status < 200 || response.status >= 300))
			|| typeof user?.id !== "string" || user.id !== userId) {
			if (enabled) rememberFailure(userId, response);
			return false;
		}
		const dispatcher = findByProps("dispatch", "subscribe") ?? findByStoreName("Dispatcher");
		if (typeof dispatcher?.dispatch !== "function") return false;
		dispatcher.dispatch({ type: "USER_UPDATE", user });
		dispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId });
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

function MentionResolution({
	userId,
	mentionProps,
	fallback,
	UserMention,
}: {
	userId: string;
	mentionProps: Record<string, any>;
	fallback: any;
	UserMention: any;
}) {
	const [resolved, setResolved] = React.useState(isCached(userId));
	React.useEffect(() => {
		let active = true;
		if (isCached(userId)) {
			setResolved(true);
		} else {
			void resolveUser(userId).then(() => {
				if (active && enabled && isCached(userId)) setResolved(true);
			});
		}
		return () => { active = false; };
	}, [userId]);

	if (!enabled || !resolved || !isCached(userId) || typeof UserMention !== "function") return fallback;
	return React.createElement(UserMention, {
		...mentionProps,
		userId,
		channelId: mentionProps.channelId,
		inlinePreview: mentionProps.inlinePreview,
		className: mentionProps.className ?? "mention",
	});
}

function findMentionModule(): any {
	const module = findByProps("RoleMention", "UserMention");
	return typeof module?.RoleMention === "function" && typeof module?.UserMention === "function"
		? module
		: undefined;
}

function installMentionPatch(): boolean {
	const module = findMentionModule();
	if (!module) return false;
	unpatchMention = after("RoleMention", module, ([props]: any[], fallback: any) => {
		if (!enabled || props?.userId) return fallback;
		const userId = extractMentionId(props);
		if (!userId) return fallback;
		return React.createElement(MentionResolution, {
			key: `god-console-mention-${userId}`,
			userId,
			mentionProps: props,
			fallback,
			UserMention: module.UserMention,
		});
	});
	return true;
}

function stopMentionPatch() {
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = undefined;
	if (unpatchMention) {
		unpatchMention();
		unpatchMention = undefined;
	}
}

export function setValidUserEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (enabled) {
		if (installMentionPatch()) return;
		retryCount = 0;
		retryTimer = setInterval(() => {
			retryCount++;
			if (installMentionPatch() || retryCount >= 30) stopMentionPatch();
		}, 1000);
		return;
	}
	stopMentionPatch();
	inFlightUsers.clear();
	retryAfter.clear();
}