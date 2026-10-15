import { storage } from "@vendetta/plugin";
import { plugins, startPlugin, stopPlugin } from "@vendetta/plugins";
import { createMMKVBackend } from "@vendetta/storage";
import { MANAGED_PLUGINS } from "./catalog";

export type CrashRecord = {
	pluginName: string;
	timestamp: number;
	logs: string;
};

export type CrashReason = {
	pluginName: string;
	timestamp: number;
};

const LAST_CRASH_KEY = "lastCrash";
const CRASH_REASONS_KEY = "crashReasons";
const PENDING_DISABLE_KEY = "pendingCrashDisable";
const FEATURE_STORAGE_KEYS: Record<string, string[]> = {
	"Aura Control": ["enabled"],
	"Ephemeral Entity": [
		"anonymiseByDefault",
		"clearTrackingUrls",
		"enableSilentLeave",
		"hideTypingStatus",
	],
	Omniscience: ["enabled"],
	"Sage Eyes": ["enableHiddenChannels", "enableMessageHistory"],
};

type PendingDisable = {
	pluginName: string;
	storageKey: string;
	timestamp: number;
};

function identifyPlugin(message: string, stack: string) {
	const errorText = `${message}\n${stack}`.replace(/%20|\+/gi, " ").toLocaleLowerCase();
	for (const plugin of MANAGED_PLUGINS) {
		if (errorText.includes(plugin.name.toLocaleLowerCase())) {
			return plugin.name;
		}
	}

	const pluginPath = stack.match(/Revenge(?:%20|\s)Plugins[\\/](.+?)(?:[\\/?:]|$)/i)?.[1];
	if (pluginPath) {
		try {
			return decodeURIComponent(pluginPath.replace(/\+/g, " "));
		} catch {
			return pluginPath;
		}
	}
	return "Unknown plugin";
}

function errorDetails(error: unknown) {
	if (error instanceof Error) {
		return {
			message: error.message || error.name,
			stack: error.stack || "",
		};
	}
	return { message: String(error), stack: "" };
}

export function getLastCrash(): CrashRecord | undefined {
	const record: unknown = storage[LAST_CRASH_KEY];
	if (
		typeof record === "object" &&
		record !== null &&
		"pluginName" in record &&
		typeof record.pluginName === "string" &&
		"timestamp" in record &&
		typeof record.timestamp === "number" &&
		Number.isFinite(record.timestamp) &&
		"logs" in record &&
		typeof record.logs === "string"
	) {
		return {
			pluginName: record.pluginName,
			timestamp: record.timestamp,
			logs: record.logs,
		};
	}
	if (record !== undefined) {
		console.error("[Tenshi's Plugins] Ignoring invalid saved crash log data.");
	}
	return undefined;
}

export function getCrashReasons(): CrashReason[] {
	const reasons: unknown = storage[CRASH_REASONS_KEY];
	if (!Array.isArray(reasons)) return [];
	return reasons.filter(
		(reason): reason is CrashReason =>
			typeof reason === "object" &&
			reason !== null &&
			"pluginName" in reason &&
			typeof reason.pluginName === "string" &&
			"timestamp" in reason &&
			typeof reason.timestamp === "number" &&
			Number.isFinite(reason.timestamp),
	);
}

export function clearLastCrash() {
	storage[LAST_CRASH_KEY] = undefined;
	storage[CRASH_REASONS_KEY] = undefined;
	storage[PENDING_DISABLE_KEY] = undefined;
}

function findFeatureToggle(pluginName: string, stack: string, message: string): string | undefined {
	const source = `${stack}\n${message}`.toLocaleLowerCase();
	switch (pluginName) {
		case "Aura Control":
			return "enabled";
		case "Omniscience":
			return "enabled";
		case "Sage Eyes":
			if (/hiddenchannel|hidden channel|isHidden|patchPrivateChannelObfuscation|ChannelInfo|transitionToGuild/i.test(source)) {
				return "enableHiddenChannels";
			}
			if (/messagehistory|message history|initializeMessageHistory|deletedmessage|editHistory/i.test(source)) {
				return "enableMessageHistory";
			}
			break;
		case "Ephemeral Entity":
			if (/anonymizeUploadFiles|anonymiseByDefault|uploadFiles/i.test(source)) return "anonymiseByDefault";
			if (/clearTrackingUrlsInMessage|clearTrackingUrls|sendMessage|editMessage/i.test(source)) return "clearTrackingUrls";
			if (/enableSilentLeave|silent leave|leave silent/i.test(source)) return "enableSilentLeave";
			if (/setTypingStatusHidden|hideTypingStatus|silent typing|silenttype/i.test(source)) return "hideTypingStatus";
			break;
	}
	return undefined;
}

function saveCrash(error: unknown, isFatal: boolean) {
	const { message, stack } = errorDetails(error);
	const timestamp = Date.now();
	const pluginName = identifyPlugin(message, stack);
	const logs = [
		`Unhandled JavaScript error (${isFatal ? "fatal" : "non-fatal"})`,
		`Timestamp: ${new Date(timestamp).toISOString()}`,
		`Message: ${message}`,
		stack ? `Stack:\n${stack}` : "Stack: unavailable",
	].join("\n");

	storage[LAST_CRASH_KEY] = {
		pluginName,
		timestamp,
		logs,
	} satisfies CrashRecord;

	if (pluginName !== "Unknown plugin") {
		storage[CRASH_REASONS_KEY] = [
			...getCrashReasons(),
			{ pluginName, timestamp },
		].slice(-10);
	}

	if (isFatal) {
		const storageKey = findFeatureToggle(pluginName, stack, message);
		if (storageKey) {
			const pending = getPendingDisables().filter(
				(item) => item.pluginName !== pluginName || item.storageKey !== storageKey,
			);
			storage[PENDING_DISABLE_KEY] = [
				...pending,
				{ pluginName, storageKey, timestamp },
			].slice(-10) satisfies PendingDisable[];
		}
	}
}

function getPendingDisables(): PendingDisable[] {
	const pendingItems: unknown = storage[PENDING_DISABLE_KEY];
	if (!Array.isArray(pendingItems)) return [];
	return pendingItems.filter(
		(pending): pending is PendingDisable =>
			typeof pending === "object" &&
			pending !== null &&
			"pluginName" in pending &&
			typeof pending.pluginName === "string" &&
			"storageKey" in pending &&
			typeof pending.storageKey === "string" &&
			FEATURE_STORAGE_KEYS[pending.pluginName]?.includes(pending.storageKey) === true &&
			"timestamp" in pending &&
			typeof pending.timestamp === "number" &&
			Number.isFinite(pending.timestamp),
	);
}

export async function recoverFromLastCrash() {
	for (const pending of getPendingDisables()) {
		const entry = MANAGED_PLUGINS.find((plugin) => plugin.name === pending.pluginName);
		if (!entry) {
			console.error(`[Tenshi's Plugins] Cannot recover unknown plugin ${pending.pluginName}.`);
			continue;
		}

		const installedKey = [entry.url, ...entry.legacyUrls].find((url) => plugins[url]) ?? entry.url;
		const installed = plugins[installedKey];
		const backend = createMMKVBackend(installedKey);
		const wasEnabled = !!installed?.enabled;
		let stopped = false;

		try {
			const savedSettings: unknown = await backend.get();
			if (!savedSettings || typeof savedSettings !== "object" || Array.isArray(savedSettings)) {
				throw new Error(`Saved settings for ${pending.pluginName} are not a valid object.`);
			}
			if (wasEnabled) {
				stopPlugin(installedKey, false);
				stopped = true;
			}
			await backend.set({
				...savedSettings,
				[pending.storageKey]: false,
			});
			if (stopped) {
				await startPlugin(installedKey);
				stopped = false;
			}
			console.warn(
				`[Tenshi's Plugins] Disabled ${pending.storageKey} for ${pending.pluginName} after a fatal error.`,
			);
			storage[PENDING_DISABLE_KEY] = getPendingDisables().filter(
				(item) => item.pluginName !== pending.pluginName || item.storageKey !== pending.storageKey,
			);
		} catch (error) {
			if (stopped) {
				try {
					await startPlugin(installedKey);
				} catch (restartError) {
					console.error(`[Tenshi's Plugins] Could not restart ${pending.pluginName} after crash recovery.`, restartError);
				}
			}
			console.error(`[Tenshi's Plugins] Could not disable ${pending.storageKey} for ${pending.pluginName}.`, error);
		}
	}
}

type GlobalErrorUtils = {
	getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
	setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export function installCrashCapture() {
	const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
	if (!errorUtils) {
		console.error("[Tenshi's Plugins] React Native's global error handler is unavailable; crash logging is disabled.");
		return () => {};
	}

	const previousHandler = errorUtils.getGlobalHandler();
	const handler = (error: unknown, isFatal = false) => {
		try {
			saveCrash(error, isFatal);
		} catch (captureError) {
			console.error("[Tenshi's Plugins] Could not save the last crash log.", captureError);
		}
		previousHandler(error, isFatal);
	};

	errorUtils.setGlobalHandler(handler);
	return () => {
		if (errorUtils.getGlobalHandler() === handler) {
			errorUtils.setGlobalHandler(previousHandler);
		}
	};
}
