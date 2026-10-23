import { React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { after, instead } from "@vendetta/patcher";
import { find, findByProps, findByStoreName } from "../../compat";
import { composeTranslatedContent, createTranslationLayout, restoreTranslatedContent, type TranslationLayout } from "./translationCore";

const GOOGLE_HOSTS = ["https://translate.googleapis.com", "https://clients5.google.com"];
const GOOGLE_PATH = "/translate_a/t?client=dict-chrome-ex&sl=auto&tl=";
const CACHE_LIMIT = 2000;
const SAVE_LIMIT = 1500;
const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const BATCH_LIMIT = 40;
const BATCH_CHARS = 6000;
const MAX_PARALLEL = 3;
const TIMEOUT_MS = 8000;
const SAVED_KEY = "omniscienceTranslations";
const MENU_ACTION_KEY = "omniscienceTranslateAction";

type TranslationSettings = {
	enabled: boolean;
	mode: "auto" | "manual";
	target: "discord" | "phone";
	showLanguage: boolean;
	showOriginal: boolean;
};

type TranslationEntry = {
	state: "queued" | "sending" | "done" | "same" | "failed";
	target: string;
	text: string;
	layout?: TranslationLayout;
	translated?: string;
	language?: string;
	ids: Set<string>;
};

const dispatcher = findByProps("dispatch", "subscribe", "unsubscribe");
const messageStore = findByProps("getMessage", "getMessages");
const userStore = findByProps("getCurrentUser");
let localeStore: any;
const listeners = new Set<() => void>();
const cache = new Map<string, TranslationEntry>();
const queue: string[] = [];
const choices = new Map<string, boolean>();
const shown = new Map<string, { channelId: string; message: any }>();
let settings: TranslationSettings = {
	enabled: false,
	mode: "auto",
	target: "discord",
	showLanguage: true,
	showOriginal: false,
};
let rowUnpatch: (() => void) | undefined;
let menuUnpatch: (() => void) | undefined;
let retryUnsubscribe: (() => void) | undefined;
let scheduleTimer: ReturnType<typeof setTimeout> | undefined;
let pauseUntil = 0;
let failures = 0;
let hostIndex = 0;
let active = 0;
let translatedCount = 0;
let restoring = false;
let restored = false;
let logoutSubscribed = false;
let localeSubscribed = false;
let generation = 0;
let requestTarget = "en";
let lastError = "";
const activeControllers = new Set<AbortController>();

function currentAccountId() {
	const id = userStore?.getCurrentUser?.()?.id;
	return typeof id === "string" && id ? id : undefined;
}

function getLocaleStore() {
	if (!localeStore) {
		localeStore = findByStoreName("LocaleStore") ?? find((candidate: any) => {
			const value = candidate?.default ?? candidate;
			return value && typeof value === "object" && ("locale" in value || "systemLocale" in value);
		});
	}
	return localeStore?.default ?? localeStore;
}

function localeChanged() {
	const nextTarget = languageCode(settings.target);
	if (nextTarget !== requestTarget) {
		requestTarget = nextTarget;
		cancelPending();
	}
	redraw();
	if (settings.enabled) schedule(0);
}

function languageCode(kind: TranslationSettings["target"]) {
	let rawLocale: unknown;
	try {
		const store = getLocaleStore();
		rawLocale = kind === "phone"
			? store?.systemLocale ?? store?.locale
			: store?.locale;
	} catch {}
	const locale = typeof rawLocale === "string" && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/.test(rawLocale)
		? rawLocale
		: "en-US";
	const [base, region] = locale.replace("_", "-").split("-");
	if (base.toLowerCase() === "zh") return /^(TW|HK|MO|Hant)$/i.test(region ?? "") ? "zh-TW" : "zh-CN";
	if (base.toLowerCase() === "nb" || base.toLowerCase() === "nn") return "no";
	return base.toLowerCase();
}

function languageName(code: string) {
	try {
		const names = new Intl.DisplayNames(["en"], { type: "language" });
		return names.of(code) || code;
	} catch {
		return code;
	}
}

function keyFor(target: string, text: string) {
	return `${target}\u0000${text}`;
}

function notify() {
	for (const listener of listeners) listener();
}

function redraw() {
	try {
		messageStore?.emitChange?.();
	} catch {}
}

function remember(key: string, entry: TranslationEntry) {
	if (cache.has(key)) cache.delete(key);
	else if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
	cache.set(key, entry);
}

function persist() {
	const accountId = currentAccountId();
	if (!accountId) return;
	const entries: [string, string, string, string][] = [];
	cache.forEach((entry) => {
		if (entry.state === "done" && typeof entry.translated === "string") {
			entries.push([entry.target, entry.text, entry.translated, entry.language ?? ""]);
		}
	});
	const value = {
		version: 1,
		accountId,
		entries: entries.slice(-SAVE_LIMIT),
		choices: Array.from(choices.entries()).slice(-1000),
	};
	let serialized = JSON.stringify(value);
	if (serialized.length > MAX_SAVE_BYTES) {
		value.entries = entries.slice(-Math.floor(SAVE_LIMIT / 2));
		serialized = JSON.stringify(value);
	}
	storage[SAVED_KEY] = serialized.length <= MAX_SAVE_BYTES ? value : { version: 1, accountId, entries: [], choices: [] };
}

function restore() {
	if (restored || restoring) return;
	const accountId = currentAccountId();
	if (!accountId) return;
	restoring = true;
	try {
		const saved = storage[SAVED_KEY];
		if (saved?.version === 1 && saved.accountId === accountId) {
			if (Array.isArray(saved.choices)) {
				for (const item of saved.choices.slice(-1000)) {
					if (Array.isArray(item) && typeof item[0] === "string" && typeof item[1] === "boolean") choices.set(item[0], item[1]);
				}
			}
			if (Array.isArray(saved.entries)) {
				for (const item of saved.entries.slice(-SAVE_LIMIT)) {
					if (!Array.isArray(item) || item.length !== 4 || !item.every((part) => typeof part === "string")) continue;
					const [target, text, translated, language] = item;
					remember(keyFor(target, text), { state: "done", target, text, translated, language, ids: new Set() });
				}
			}
		}
	} finally {
		restoring = false;
		restored = true;
	}
}

function contentSource(message: any) {
	if (!message || typeof message !== "object") return null;
	try {
		const inner = message.getContentMessage?.();
		if (inner && typeof inner === "object") return inner;
	} catch {}
	const snapshots = message.messageSnapshots ?? message.message_snapshots;
	if (Array.isArray(snapshots) && snapshots[0]?.message) return snapshots[0].message;
	return message;
}

function wanted(id: string) {
	const choice = choices.get(id);
	return settings.mode === "manual" ? choice === true : choice !== false;
}

function rememberShown(channelId: string, id: string, message: any) {
	shown.delete(id);
	shown.set(id, { channelId, message });
	while (shown.size > 300) shown.delete(shown.keys().next().value!);
}

function translatedRow(message: any, row: any) {
	if (!settings.enabled || !message || !Array.isArray(message.content)) return message;
	const source = row?.message ?? message;
	const raw = contentSource(source);
	const id = String(source?.id ?? message.id ?? "");
	const channelId = String(source?.channel_id ?? source?.channelId ?? message.channel_id ?? message.channelId ?? "");
	if (!id || !channelId || typeof raw?.content !== "string" || !wanted(id)) return message;
	const me = userStore?.getCurrentUser?.();
	if (settings.mode === "auto" && source.author?.id === me?.id && choices.get(id) !== true) return message;
	const layout = createTranslationLayout(message.content);
	if (!layout) return message;
	const target = languageCode(settings.target);
	const key = keyFor(target, layout.text);
	let entry = cache.get(key);
	if (!entry) {
		entry = { state: "queued", target, text: layout.text, layout, ids: new Set() };
		remember(key, entry);
		queue.unshift(key);
		schedule(50);
	}
	if (!entry.layout) entry.layout = layout;
	if (entry.state === "queued" || entry.state === "sending") {
		entry.ids.add(id);
		rememberShown(channelId, id, source);
		return message;
	}
	if (entry.state !== "done" || !entry.translated) return message;
	const translated = composeTranslatedContent(entry.translated, layout, message.content, {
		showLanguage: settings.showLanguage,
		showOriginal: settings.showOriginal,
		language: languageName(entry.language || ""),
	});
	return translated ? { ...message, content: translated } : message;
}

function findRowGenerator() {
	const metroRequire = (globalThis as typeof globalThis & { __r?: (id: number) => any }).__r;
	if (typeof metroRequire === "function") {
		try {
			const candidate = metroRequire(7591)?.default;
			if (typeof candidate?.prototype?.generate === "function") return candidate;
		} catch {}
	}
	const module = find((candidate: any) => {
		const component = candidate?.default ?? candidate;
		if (typeof component?.prototype?.generate !== "function") return false;
		const source = Function.prototype.toString.call(component.prototype.generate);
		return source.includes("rowType") && source.includes("message");
	});
	const generator = module?.default ?? module;
	return typeof generator?.prototype?.generate === "function" ? generator : undefined;
}

function patchRows() {
	const generator = findRowGenerator();
	if (!generator) return false;
	rowUnpatch = after("generate", generator.prototype, (args: any[], result: any) => {
		const row = args[0];
		if (!row || row.rowType !== 1 || !result?.message) return result;
		const translated = translatedRow(result.message, row);
		return translated === result.message ? result : { ...result, message: translated };
	});
	return true;
}

function translateMenuTree(tree: any, props: any, message: any): any {
	if (!tree || !React || !message?.id) return tree;
	const source = contentSource(message);
	if (typeof source?.content !== "string" || !source.content.trim()) return tree;
	const me = userStore?.getCurrentUser?.();
	if (settings.mode === "auto" && message.author?.id === me?.id && choices.get(message.id) !== true) return tree;
	let added = false;
	function visit(node: any, depth: number): any {
		if (!node || depth > 18 || typeof node !== "object" || !node.props) return node;
		const children = node.props.children;
		if (!added && Array.isArray(children)) {
			const template = children.find((child: any) => child?.props && typeof child.props.label === "string" && typeof child.props.onPress === "function");
			if (template && !children.some((child: any) => child?.key === MENU_ACTION_KEY)) {
				added = true;
				const isTranslated = wanted(String(message.id));
				const row = React.cloneElement(template, {
					key: MENU_ACTION_KEY,
					label: isTranslated ? "Show original" : "Translate",
					arrow: false,
					variant: undefined,
					onPress: () => {
						const sheets = findByProps("hideActionSheet");
					try { sheets?.hideActionSheet?.("MessageLongPressActionSheet"); } catch {}
					try { props?.onClose?.(); } catch {}
					const id = String(message.id);
					const next = !wanted(id);
					if (choices.size >= 1000 && !choices.has(id)) choices.delete(choices.keys().next().value!);
					choices.set(id, next);
					if (next) schedule(0);
					persist();
					redraw();
					notify();
					},
				});
				const index = children.indexOf(template) + 1;
				const updated = children.slice(0, index).concat(row, children.slice(index));
				return React.cloneElement(node, { children: updated });
			}
		}
		if (Array.isArray(children)) {
			const updated = children.map((child: any) => visit(child, depth + 1));
			return updated.some((child: any, index: number) => child !== children[index])
				? React.cloneElement(node, { children: updated })
				: node;
		}
		const updated = visit(children, depth + 1);
		return updated !== children ? React.cloneElement(node, { children: updated }) : node;
	}
	return visit(tree, 0);
}

function patchMenu() {
	const metroRequire = (globalThis as typeof globalThis & { __r?: (id: number) => any }).__r;
	let module = find((candidate: any) => {
		const component = candidate?.default;
		return typeof component === "function" && /LongPressMessageActionSheet/.test(component.name);
	});
	if (!module && typeof metroRequire === "function") {
		try { module = metroRequire(11281); } catch {}
	}
	if (!module?.default || menuUnpatch) return Boolean(menuUnpatch);
	menuUnpatch = instead("default", module, (args: any[], original: (...args: any[]) => any) => {
		const tree = original(...args);
		const props = args[0];
		return settings.enabled ? translateMenuTree(tree, props, props?.message) : tree;
	});
	return true;
}

function schedule(delay: number) {
	if (scheduleTimer !== undefined || active >= MAX_PARALLEL || !queue.length || !settings.enabled) return;
	const wait = Math.max(delay, pauseUntil - Date.now());
	scheduleTimer = setTimeout(() => {
		scheduleTimer = undefined;
		void sendNext();
	}, wait);
}

function nextBatch() {
	const keys: string[] = [];
	let chars = 0;
	while (queue.length && keys.length < BATCH_LIMIT) {
		const key = queue[0];
		const entry = cache.get(key);
		if (!entry || entry.state !== "queued" || entry.target !== requestTarget) {
			queue.shift();
			if (entry?.state === "queued") cache.delete(key);
			continue;
		}
		const size = encodeURIComponent(entry.text).length;
		if (keys.length && chars + size > BATCH_CHARS) break;
		queue.shift();
		keys.push(key);
		chars += size;
	}
	return keys;
}

async function requestBatch(entries: TranslationEntry[], target: string, host: number) {
	const fetcher = (globalThis as any).fetch;
	if (typeof fetcher !== "function") throw new Error("networking is unavailable");
	const controller = typeof AbortController === "function" ? new AbortController() : undefined;
	if (controller) activeControllers.add(controller);
	const body = entries.map((entry) => `q=${encodeURIComponent(entry.text)}`).join("&");
	const url = `${GOOGLE_HOSTS[host % GOOGLE_HOSTS.length]}${GOOGLE_PATH}${encodeURIComponent(target)}`;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller?.abort();
			reject(new Error("no answer"));
		}, TIMEOUT_MS);
	});
	try {
		return await Promise.race([
			fetcher(url, {
				method: "POST",
				credentials: "omit",
				headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
				body,
				signal: controller?.signal,
			}).then(async (response: any) => {
				if (!response.ok) {
					const error = new Error(`HTTP ${response.status}`) as Error & { status?: number };
					error.status = response.status;
					throw error;
				}
				const result = await response.json();
				if (!Array.isArray(result)) throw new Error("unreadable answer");
				return entries.map((_, index) => {
					const item = result[index];
					if (Array.isArray(item)) return { text: String(item[0] ?? ""), language: typeof item[1] === "string" ? item[1] : "" };
					if (typeof item === "string") return { text: item, language: "" };
					return null;
				});
			}),
			timeout,
		]);
	} finally {
		if (controller) activeControllers.delete(controller);
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function sendNext() {
	if (!settings.enabled || active >= MAX_PARALLEL) return;
	if (!restored) restore();
	requestTarget = languageCode(settings.target);
	const keys = nextBatch();
	if (!keys.length) return;
	const entries = keys.map((key) => cache.get(key)!);
	const currentGeneration = generation;
	const host = hostIndex;
	entries.forEach((entry) => { entry.state = "sending"; });
	active++;
	try {
		const results = await requestBatch(entries, requestTarget, host);
		if (currentGeneration !== generation) return;
		failures = 0;
		lastError = "";
		entries.forEach((entry, index) => {
			const result = results[index];
			if (!result) {
				entry.state = "queued";
				queue.push(keyFor(entry.target, entry.text));
				return;
			}
			if (result.text === entry.text || (result.language && result.language.split("-")[0].toLowerCase() === requestTarget.split("-")[0].toLowerCase())) {
				entry.state = "same";
				return;
			}
			if (!entry.layout || !restoreTranslatedContent(result.text, entry.layout)) {
				entry.state = "failed";
				return;
			}
			entry.translated = result.text;
			entry.language = result.language;
			entry.state = "done";
			translatedCount++;
		});
		persist();
		redraw();
	} catch (error) {
		if (currentGeneration !== generation) return;
		entries.slice().reverse().forEach((entry) => {
			entry.state = "queued";
			queue.unshift(keyFor(entry.target, entry.text));
		});
		failures++;
		hostIndex = host === hostIndex ? hostIndex + 1 : hostIndex;
		const limited = (error as { status?: number })?.status === 429;
		const delay = limited
			? Math.min(600000, 15000 * 2 ** Math.min(6, failures - 1))
			: failures < 3 ? 500 * failures : Math.min(120000, 5000 * 2 ** Math.min(5, failures - 3));
		pauseUntil = Math.max(pauseUntil, Date.now() + delay);
		lastError = failures < 3 && !limited ? "" : `${limited ? "Google Translate asked to slow down." : "Google Translate isn't answering."} Trying again in ${Math.max(1, Math.round(delay / 1000))} s.`;
	} finally {
		active--;
		notify();
		if (queue.length && settings.enabled) schedule(failures ? 0 : 30);
	}
}

function retryPatches() {
	if (!settings.enabled) return;
	if (!rowUnpatch) patchRows();
	if (!menuUnpatch) patchMenu();
}

function watchForPatchTargets() {
	if (retryUnsubscribe || typeof dispatcher?.subscribe !== "function" || typeof dispatcher?.unsubscribe !== "function") return;
	const retry = () => retryPatches();
	for (const event of ["CONNECTION_OPEN", "MESSAGE_CREATE", "LOAD_MESSAGES_SUCCESS"]) dispatcher.subscribe(event, retry);
	retryUnsubscribe = () => {
		for (const event of ["CONNECTION_OPEN", "MESSAGE_CREATE", "LOAD_MESSAGES_SUCCESS"]) dispatcher.unsubscribe(event, retry);
		retryUnsubscribe = undefined;
	};
}

function handleLogout() {
	generation++;
	activeControllers.forEach((controller) => controller.abort());
	activeControllers.clear();
	cache.clear();
	queue.length = 0;
	choices.clear();
	shown.clear();
	restored = false;
	restoring = false;
	delete storage[SAVED_KEY];
	redraw();
	notify();
}

export function initializeTranslations(next: Partial<TranslationSettings>) {
	const previouslyEnabled = settings.enabled;
	settings = { ...settings, ...next };
	if (!logoutSubscribed && typeof dispatcher?.subscribe === "function") {
		dispatcher.subscribe("LOGOUT", handleLogout);
		logoutSubscribed = true;
	}
	const locale = getLocaleStore();
	if (!localeSubscribed && typeof locale?.addChangeListener === "function" && typeof locale?.removeChangeListener === "function") {
		locale.addChangeListener(localeChanged);
		localeSubscribed = true;
	}
	if (!settings.enabled) {
		if (previouslyEnabled) cancelPending();
		rowUnpatch?.();
		menuUnpatch?.();
		rowUnpatch = undefined;
		menuUnpatch = undefined;
		if (scheduleTimer !== undefined) clearTimeout(scheduleTimer);
		scheduleTimer = undefined;
		return;
	}
	restore();
	retryPatches();
	watchForPatchTargets();
	requestTarget = languageCode(settings.target);
	schedule(0);
}

export function updateTranslationSettings(next: Partial<TranslationSettings>) {
	const previous = settings;
	const changedTarget = next.target !== undefined && next.target !== settings.target;
	settings = { ...settings, ...next };
	storage.translateMessagesMode = settings.mode;
	storage.translateMessagesTarget = settings.target;
	storage.translateMessagesShowLanguage = settings.showLanguage;
	storage.translateMessagesShowOriginal = settings.showOriginal;
	if (changedTarget) {
		requestTarget = languageCode(settings.target);
		cancelPending();
	}
	if (!settings.enabled) {
		if (previous.enabled) cancelPending();
		rowUnpatch?.();
		menuUnpatch?.();
		rowUnpatch = undefined;
		menuUnpatch = undefined;
		if (scheduleTimer !== undefined) clearTimeout(scheduleTimer);
		scheduleTimer = undefined;
	} else {
		if (previous.mode !== settings.mode && settings.mode === "manual") cancelPending();
		retryPatches();
		watchForPatchTargets();
		schedule(0);
	}
	redraw();
	notify();
}

export function subscribeTranslations(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getTranslationStatus() {
	const waiting = queue.length;
	return {
		translated: translatedCount,
		waiting,
		cacheSize: Array.from(cache.values()).filter((entry) => entry.state === "done").length,
		error: lastError,
		target: languageCode(settings.target),
	};
}

export function getTranslationTargetName(target: TranslationSettings["target"]) {
	return languageName(languageCode(target));
}

export function clearTranslations() {
	generation++;
	activeControllers.forEach((controller) => controller.abort());
	activeControllers.clear();
	cache.clear();
	queue.length = 0;
	choices.clear();
	translatedCount = 0;
	lastError = "";
	persist();
	redraw();
	notify();
}

function cancelPending() {
	generation++;
	queue.length = 0;
	activeControllers.forEach((controller) => controller.abort());
	activeControllers.clear();
	cache.forEach((entry) => {
		if (entry.state === "queued" || entry.state === "sending") entry.state = "failed";
	});
}

export function removeTranslationPatches() {
	cancelPending();
	rowUnpatch?.();
	menuUnpatch?.();
	rowUnpatch = undefined;
	menuUnpatch = undefined;
	if (scheduleTimer !== undefined) clearTimeout(scheduleTimer);
	scheduleTimer = undefined;
	retryUnsubscribe?.();
	if (logoutSubscribed && typeof dispatcher?.unsubscribe === "function") dispatcher.unsubscribe("LOGOUT", handleLogout);
	logoutSubscribed = false;
	const locale = getLocaleStore();
	if (localeSubscribed && typeof locale?.removeChangeListener === "function") locale.removeChangeListener(localeChanged);
	localeSubscribed = false;
}