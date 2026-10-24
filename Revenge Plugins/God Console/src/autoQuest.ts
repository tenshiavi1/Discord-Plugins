import { FluxDispatcher, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { find, findByName, findByProps, findByStoreName } from "../../compat";
import { showToast } from "../../shared/toast";
import { canProcessQuest, getAutoQuestTask, getQuestExpiry, getQuestProgress, type AutoQuestOptions, type AutoQuestTask } from "./autoQuestCore";

const MOBILE_QUEST_LOCATION = 12;
const SCAN_DELAY_MS = 2500;
const QUEST_REFRESH_MS = 30 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 60 * 1000;
const QUEST_REFUSED_DELAY_MS = 6 * 60 * 60 * 1000;
const questRuntime = {
	enabled: false,
	video: true,
	activity: true,
	enroll: true,
	generation: 0,
	userId: undefined as string | undefined,
	running: undefined as { id: string; task: AutoQuestTask; generation: number } | undefined,
	enrolling: false,
	scanTimer: undefined as ReturnType<typeof setTimeout> | undefined,
	refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
	store: undefined as any,
	status: "Off",
	statusError: false,
	lastRefresh: 0,
	skipped: new Map<string, number>(),
	listeners: new Set<(status: string, error: boolean) => void>(),
	dispatcher: undefined as any,
};

function updateStatus(status: string, error = false) {
	questRuntime.status = status;
	questRuntime.statusError = error;
	for (const listener of questRuntime.listeners) listener(status, error);
}

export function getAutoQuestStatus() {
	return { text: questRuntime.status, error: questRuntime.statusError };
}

export function subscribeAutoQuestStatus(listener: (status: string, error: boolean) => void) {
	questRuntime.listeners.add(listener);
	return () => questRuntime.listeners.delete(listener);
}

function getDispatcher() {
	const candidate = findByProps("dispatch", "subscribe", "unsubscribe") ?? FluxDispatcher;
	return typeof candidate?.dispatch === "function"
		&& typeof candidate?.subscribe === "function"
		&& typeof candidate?.unsubscribe === "function"
		? candidate
		: undefined;
}

function getCurrentUserId() {
	try {
		const user = (findByStoreName("UserStore") ?? findByProps("getCurrentUser"))?.getCurrentUser?.();
		return typeof user?.id === "string" ? user.id : undefined;
	} catch (error) {
		console.warn("[God Console] Could not read the active account for Auto Quest.", error);
		return undefined;
	}
}

function getAppActive() {
	try {
		const state = (findByStoreName("AppStateStore") ?? findByProps("getState"))?.getState?.();
		if (typeof state === "string") return state === "active";
	} catch (error) {
		console.warn("[God Console] Could not read app state for Auto Quest.", error);
	}
	const state = RN?.AppState?.currentState;
	return typeof state === "string" ? state === "active" : true;
}

function getQuestStore() {
	const cached = questRuntime.store;
	if (cached && typeof cached.getQuest === "function") return cached;
	const named = findByStoreName("QuestStore");
	const store = named?.default ?? named;
	if (store && typeof store.getQuest === "function") {
		questRuntime.store = store;
		return store;
	}
	const discovered = find((candidate: any) => {
		const value = candidate?.default ?? candidate;
		return typeof value?.getQuest === "function" && "quests" in value;
	});
	const value = discovered?.default ?? discovered;
	if (value && typeof value.getQuest === "function") {
		questRuntime.store = value;
		return value;
	}
	return undefined;
}

function isQuestAccessSuspended(store: any) {
	try {
		const value = store?.isQuestAccessSuspended;
		return typeof value === "function" ? value.call(store) === true : value === true;
	} catch (error) {
		console.warn("[God Console] Could not check Quest availability.", error);
		return false;
	}
}

function findFunction(name: string) {
	const named = findByName(name, true);
	if (typeof named === "function") return named;
	const module = find((candidate: any) => {
		const value = candidate?.default ?? candidate;
		return typeof value?.[name] === "function";
	});
	const target = module?.default ?? module;
	return typeof target?.[name] === "function" ? target[name] : undefined;
}

function fetchQuests(force = false) {
	const store = getQuestStore();
	const fetchCurrentQuests = findFunction("fetchCurrentQuests");
	if (!store || typeof fetchCurrentQuests !== "function") return false;
	const lastFetched = new Date(store.lastFetchedCurrentQuests ?? 0).getTime();
	if (!force && Number.isFinite(lastFetched) && Date.now() - lastFetched < QUEST_REFRESH_MS) return false;
	try {
		const result = fetchCurrentQuests();
		if (result && typeof result.catch === "function") {
			result.catch((error: unknown) => console.warn("[God Console] Could not refresh Quests.", error));
		}
		questRuntime.lastRefresh = Date.now();
		return true;
	} catch (error) {
		console.warn("[God Console] Could not refresh Quests.", error);
		return false;
	}
}

function getRestApi() {
	return findByProps("get", "post", "del", "patch") ?? findByProps("post");
}

async function postQuestRequest(url: string, body: Record<string, unknown>) {
	const api = getRestApi();
	if (typeof api?.post !== "function") throw new Error("Discord's quest network client is unavailable.");
	const response = await api.post({
		url,
		body,
		interceptResponse: (result: any, _retry: unknown, cancel: (error: Error) => void) => {
			if (!result || result.ok || typeof cancel !== "function") return false;
			const error = new Error(`Discord returned HTTP ${result.status}.`) as Error & { status?: number; body?: unknown };
			error.status = Number(result.status);
			error.body = result.body;
			cancel(error);
			return true;
		},
	});
	const status = Number(response?.status);
	if (status >= 400) {
		const failure = new Error(`Discord returned HTTP ${status}.`) as Error & { status?: number; body?: any };
		failure.status = status;
		failure.body = response?.body;
		throw failure;
	}
	return response?.body ?? response;
}

function getQuestDataUtils() {
	return findByProps("getAdDecisionData", "getAdMetadataSealed")
		?? (() => {
			const module = find((candidate: any) => {
				const value = candidate?.default ?? candidate;
				return typeof value?.getAdDecisionData === "function";
			});
			return module?.default ?? module;
		})();
}

function makeEnrollmentBody(questId: string) {
	const body: Record<string, unknown> = { location: MOBILE_QUEST_LOCATION };
	const utils = getQuestDataUtils();
	try {
		const decision = utils?.getAdDecisionData?.(questId, MOBILE_QUEST_LOCATION);
		if (decision && typeof decision === "object") Object.assign(body, decision);
	} catch (error) {
		console.warn("[God Console] Could not prepare Quest enrollment metadata.", error);
	}
	try {
		body.metadata_sealed = utils?.getAdMetadataSealed?.(MOBILE_QUEST_LOCATION) ?? null;
		body.traffic_metadata_sealed = utils?.getAdTrafficMetadataSealed?.(MOBILE_QUEST_LOCATION, questId) ?? null;
	} catch (error) {
		console.warn("[God Console] Could not prepare Quest traffic metadata.", error);
	}
	return body;
}

function convertQuestStatus(body: any) {
	const convert = findFunction("questUserStatusFromServer");
	if (typeof convert !== "function") return undefined;
	try {
		return convert(body);
	} catch (error) {
		console.warn("[God Console] Could not parse the Quest response.", error);
		return undefined;
	}
}

function refreshQuestStore(body: any, actionType: string, questId?: string) {
	const dispatcher = questRuntime.dispatcher ?? getDispatcher();
	if (actionType === "QUESTS_USER_STATUS_UPDATE") {
		if (body?.quest_id && typeof dispatcher?.dispatch === "function") {
			try {
				dispatcher.dispatch({ type: actionType, user_status: body });
				return;
			} catch (error) {
				console.warn("[God Console] Could not update video Quest progress.", error);
			}
		}
		fetchQuests(true);
		return;
	}
	const userStatus = convertQuestStatus(body);
	if (!userStatus || typeof dispatcher?.dispatch !== "function") {
		fetchQuests(true);
		return;
	}
	try {
		dispatcher.dispatch(actionType === "QUESTS_ENROLL_SUCCESS"
			? { type: actionType, enrolledQuestUserStatus: userStatus }
			: { type: actionType, questId, userStatus });
	} catch (error) {
		console.warn("[God Console] Could not update the Quest store.", error);
		fetchQuests(true);
	}
}

function scheduleScan(delay = SCAN_DELAY_MS) {
	if (!questRuntime.enabled || questRuntime.scanTimer) return;
	questRuntime.scanTimer = setTimeout(() => {
		questRuntime.scanTimer = undefined;
		void scanQuests();
	}, delay);
}

function scheduleRefresh() {
	if (!questRuntime.enabled || questRuntime.refreshTimer) return;
	questRuntime.refreshTimer = setTimeout(() => {
		questRuntime.refreshTimer = undefined;
		if (!questRuntime.enabled) return;
		fetchQuests(false);
		scheduleScan(1000);
		scheduleRefresh();
	}, QUEST_REFRESH_MS);
}

function clearTimers() {
	if (questRuntime.scanTimer) clearTimeout(questRuntime.scanTimer);
	if (questRuntime.refreshTimer) clearTimeout(questRuntime.refreshTimer);
	questRuntime.scanTimer = undefined;
	questRuntime.refreshTimer = undefined;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCurrent(entry: { id: string; generation: number }) {
	return questRuntime.enabled &&
		entry.generation === questRuntime.generation &&
		questRuntime.running?.id === entry.id;
}

async function waitWhileCurrent(entry: { id: string; generation: number }, ms: number) {
	const until = Date.now() + ms;
	while (isCurrent(entry) && Date.now() < until) {
		await sleep(Math.min(1000, until - Date.now()));
	}
	return isCurrent(entry);
}

function getApiProgress(body: any, type: string) {
	const value = Number(body?.progress?.[type]?.value);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function getRetryDelay(error: any) {
	const body = error?.body ?? error?.response?.body;
	const retryAfter = Number(body?.retry_after ?? body?.retryAfter ?? error?.retryAfter);
	if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 24 * 60 * 60 * 1000);
	const status = Number(error?.status ?? error?.response?.status);
	if (status === 429) return 60_000;
	return status > 0 ? QUEST_REFUSED_DELAY_MS : RETRY_DELAY_MS;
}

async function completeVideo(entry: { id: string; generation: number }, item: any, task: AutoQuestTask) {
	const enrolledAt = new Date(item.userStatus?.enrolledAt ?? "").getTime();
	if (!Number.isFinite(enrolledAt)) throw new Error("This Quest has no accepted timestamp.");
	let progress = getQuestProgress(item, task.type);
	while (isCurrent(entry) && progress < task.target) {
		if (!getAppActive()) {
			return false;
		}
		const startedAt = Date.now();
		await sleep(6500);
		if (!isCurrent(entry)) return false;
		if (!getAppActive()) return false;
		const elapsed = Math.max(0, (Date.now() - startedAt) / 1000);
		const serverLimit = Math.max(0, (Date.now() - enrolledAt) / 1000 + 10);
		progress = Math.min(task.target, progress + elapsed, serverLimit);
		if (progress <= getQuestProgress(item, task.type)) continue;
		const body = await postQuestRequest(`/quests/${entry.id}/video-progress`, { timestamp: progress });
		if (!isCurrent(entry)) return false;
		refreshQuestStore(body, "QUESTS_USER_STATUS_UPDATE");
		const reported = getApiProgress(body, task.type);
		if (reported > 0) progress = Math.max(progress, reported);
		updateStatus(`Watching video Quest: ${Math.floor(progress)} / ${task.target} seconds.`);
		if (body?.completed_at) return true;
	}
	if (!isCurrent(entry)) return false;
	const finalBody = await postQuestRequest(`/quests/${entry.id}/video-progress`, { timestamp: task.target });
	if (!isCurrent(entry)) return false;
	refreshQuestStore(finalBody, "QUESTS_USER_STATUS_UPDATE");
	return Boolean(finalBody?.completed_at);
}

async function completeActivity(entry: { id: string; generation: number }, item: any, task: AutoQuestTask) {
	let bestProgress = getQuestProgress(item, task.type);
	let stalled = 0;
	while (isCurrent(entry)) {
		const current = getQuestStore()?.getQuest?.(entry.id);
		if (current?.userStatus?.completedAt) return true;
		const body = await postQuestRequest(`/quests/${entry.id}/heartbeat`, {
			application_id: task.applicationId!,
			terminal: false,
		});
		if (!isCurrent(entry)) return false;
		refreshQuestStore(body, "QUESTS_SEND_HEARTBEAT_SUCCESS", entry.id);
		const progress = getApiProgress(body, task.type);
		updateStatus(`Completing mobile Activity Quest: ${Math.floor(progress)} / ${task.target} seconds.`);
		if (body?.completed_at) return true;
		if (progress > bestProgress) {
			bestProgress = progress;
			stalled = 0;
		} else if (++stalled >= 5) {
			throw new Error("Discord stopped counting Activity time.");
		}
		const remainingMs = Math.max(0, (task.target - progress) * 1000);
		const delay = remainingMs <= 60_000 ? remainingMs + 1000 : 60_000;
		if (!(await waitWhileCurrent(entry, delay))) return false;
	}
	return false;
}

async function runQuest(item: any, task: AutoQuestTask) {
	const entry = { id: item.id, task, generation: questRuntime.generation };
	questRuntime.running = entry;
	updateStatus(`Starting ${task.kind === "video" ? "video" : "mobile Activity"} Quest.`);
	try {
		const completed = task.kind === "video"
			? await completeVideo(entry, item, task)
			: await completeActivity(entry, item, task);
		if (!isCurrent(entry)) return;
		if (completed) {
			questRuntime.skipped.set(item.id, Date.now() + 10 * 60 * 1000);
			const name = item.config?.messages?.questName || "Quest";
			updateStatus(`Completed ${name}.`);
			showToast(`Completed ${name}.`);
		} else {
			updateStatus("Quest progress paused; it will resume when available.");
		}
	} catch (error) {
		if (!isCurrent(entry)) return;
		questRuntime.skipped.set(item.id, Date.now() + getRetryDelay(error));
		const message = error instanceof Error ? error.message : "Unknown Quest error.";
		console.error("[God Console] Auto Quest failed.", error);
		updateStatus(`Could not complete Quest: ${message}`, true);
		showToast("Auto Quest could not complete this Quest. Check the console for details.");
	} finally {
		if (questRuntime.running === entry) {
			questRuntime.running = undefined;
			scheduleScan(2500);
		}
	}
}

async function enrollQuest(item: any) {
	if (questRuntime.enrolling || !getAppActive()) return;
	const generation = questRuntime.generation;
	questRuntime.enrolling = true;
	updateStatus("Accepting a new Quest.");
	try {
		const body = await postQuestRequest(`/quests/${item.id}/enroll`, makeEnrollmentBody(item.id));
		if (!questRuntime.enabled || generation !== questRuntime.generation) return;
		refreshQuestStore(body, "QUESTS_ENROLL_SUCCESS");
		updateStatus("Quest accepted. Preparing it.");
	} catch (error) {
		if (questRuntime.enabled && generation === questRuntime.generation) {
			questRuntime.skipped.set(item.id, Date.now() + getRetryDelay(error));
			const message = error instanceof Error ? error.message : "Unknown enrollment error.";
			console.error("[God Console] Could not accept a Quest.", error);
			updateStatus(`Could not accept Quest: ${message}`, true);
		}
	} finally {
		if (generation === questRuntime.generation) {
			questRuntime.enrolling = false;
			scheduleScan(3500);
		}
	}
}

async function scanQuests() {
	if (!questRuntime.enabled || questRuntime.running || questRuntime.enrolling) return;
	const userId = getCurrentUserId();
	if (!userId) {
		updateStatus("Waiting for Discord sign-in.");
		scheduleScan(5000);
		return;
	}
	if (questRuntime.userId && questRuntime.userId !== userId) {
		cancelCurrentQuest();
		questRuntime.skipped.clear();
		questRuntime.lastRefresh = 0;
	}
	questRuntime.userId = userId;
	const store = getQuestStore();
	if (!store) {
		updateStatus("Waiting for Discord's Quest store.");
		scheduleScan(5000);
		return;
	}
	if (isQuestAccessSuspended(store)) {
		updateStatus("Discord has paused Quests on this account.", true);
		return;
	}
	if (!questRuntime.lastRefresh || Date.now() - questRuntime.lastRefresh > QUEST_REFRESH_MS) fetchQuests(true);
	let items: any[];
	try {
		const quests = store.quests;
		items = quests && typeof quests.values === "function" ? [...quests.values()] : [];
	} catch (error) {
		console.warn("[God Console] Could not read available Quests.", error);
		updateStatus("Could not read available Quests.", true);
		scheduleScan(5000);
		return;
	}
	const now = Date.now();
	for (const [questId, retryAt] of questRuntime.skipped) {
		if (retryAt <= now) questRuntime.skipped.delete(questId);
	}
	const candidates = items
		.filter((item) => canProcessQuest(item, now) && (questRuntime.skipped.get(item.id) ?? 0) <= now)
		.map((item) => ({ item, task: getAutoQuestTask(item, questRuntime) }))
		.filter((entry): entry is { item: any; task: AutoQuestTask } => Boolean(entry.task))
		.sort((left, right) => getQuestExpiry(left.item) - getQuestExpiry(right.item));
	const enrolled = candidates.filter(({ item }) => Boolean(item.userStatus?.enrolledAt));
	const ready = enrolled.find(({ task }) => task.kind !== "video" || getAppActive());
	if (ready) {
		void runQuest(ready.item, ready.task);
		return;
	}
	if (enrolled.length) {
		updateStatus("Video Quests resume when Discord is active.");
		scheduleScan(10_000);
		return;
	}
	const waiting = candidates[0];
	if (waiting && questRuntime.enroll && getAppActive()) {
		void enrollQuest(waiting.item);
		return;
	}
	updateStatus(waiting ? "Accept the Quest in Discord to begin." : "Watching for eligible Quests.");
	scheduleScan(10_000);
}

function onStoreChange() {
	scheduleScan(1000);
}

function onDispatcherEvent(event: any) {
	if (event?.type === "LOGOUT") {
		cancelCurrentQuest();
		questRuntime.userId = undefined;
		updateStatus("Signed out.");
		return;
	}
	if (event?.type === "CONNECTION_OPEN") {
		const nextId = event?.user?.id ?? getCurrentUserId();
		if (typeof nextId === "string" && questRuntime.userId && nextId !== questRuntime.userId) {
			cancelCurrentQuest();
			questRuntime.skipped.clear();
			questRuntime.lastRefresh = 0;
		}
		if (typeof nextId === "string") questRuntime.userId = nextId;
		fetchQuests(true);
		scheduleScan(8000);
		scheduleRefresh();
		return;
	}
	if (event?.type === "APP_STATE_UPDATE" && event.state === "active") scheduleScan(1500);
}

function cancelCurrentQuest() {
	questRuntime.generation++;
	questRuntime.running = undefined;
	questRuntime.enrolling = false;
	clearTimers();
}

function startAutoQuest() {
	if (!questRuntime.enabled) return;
	const dispatcher = getDispatcher();
	if (!dispatcher) {
		updateStatus("Discord's event dispatcher is unavailable.", true);
		return;
	}
	questRuntime.dispatcher = dispatcher;
	dispatcher.subscribe("CONNECTION_OPEN", onDispatcherEvent);
	dispatcher.subscribe("LOGOUT", onDispatcherEvent);
	dispatcher.subscribe("APP_STATE_UPDATE", onDispatcherEvent);
	questRuntime.store = getQuestStore();
	questRuntime.store?.addChangeListener?.(onStoreChange);
	questRuntime.userId = getCurrentUserId();
	updateStatus("Looking for eligible Quests.");
	fetchQuests(true);
	scheduleScan(questRuntime.userId ? 1500 : 8000);
	scheduleRefresh();
}

export function setAutoQuestOptions(options: Partial<{
	enabled: boolean;
	video: boolean;
	activity: boolean;
	enroll: boolean;
}>) {
	const nextEnabled = options.enabled ?? questRuntime.enabled;
	const changed = nextEnabled !== questRuntime.enabled
		|| (options.video != null && options.video !== questRuntime.video)
		|| (options.activity != null && options.activity !== questRuntime.activity)
		|| (options.enroll != null && options.enroll !== questRuntime.enroll);
	questRuntime.video = options.video ?? questRuntime.video;
	questRuntime.activity = options.activity ?? questRuntime.activity;
	questRuntime.enroll = options.enroll ?? questRuntime.enroll;
	questRuntime.enabled = nextEnabled;
	storage.autoQuestEnabled = nextEnabled;
	storage.autoQuestVideo = questRuntime.video;
	storage.autoQuestActivity = questRuntime.activity;
	storage.autoQuestEnroll = questRuntime.enroll;
	if (!changed) return;
	stopAutoQuest();
	questRuntime.enabled = nextEnabled;
	if (nextEnabled) startAutoQuest();
	else updateStatus("Off");
}

export function stopAutoQuest() {
	questRuntime.enabled = false;
	questRuntime.generation++;
	questRuntime.running = undefined;
	questRuntime.enrolling = false;
	clearTimers();
	const dispatcher = questRuntime.dispatcher;
	if (dispatcher) {
		dispatcher.unsubscribe("CONNECTION_OPEN", onDispatcherEvent);
		dispatcher.unsubscribe("LOGOUT", onDispatcherEvent);
		dispatcher.unsubscribe("APP_STATE_UPDATE", onDispatcherEvent);
	}
	questRuntime.dispatcher = undefined;
	questRuntime.store?.removeChangeListener?.(onStoreChange);
	questRuntime.store = undefined;
}
