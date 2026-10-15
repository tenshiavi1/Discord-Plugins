import { storage } from "@vendetta/plugin";
import { plugins, startPlugin, stopPlugin } from "@vendetta/plugins";
import { createMMKVBackend } from "@vendetta/storage";
import { MANAGED_PLUGINS } from "./catalog";
import { installPluginCrashGuard } from "../../shared/crashGuard";

let removeCrashGuard: (() => void) | undefined = installPluginCrashGuard("Tenshi's Plugins", storage);

export type CrashRecord = {
	pluginName: string;
	timestamp: number;
	logs: string;
	errorName?: string;
	message?: string;
	fatal?: boolean;
};

export type CrashReason = {
	pluginName: string;
	timestamp: number;
};

const LAST_CRASH_KEY = "lastCrash";
const CRASH_REASONS_KEY = "crashReasons";
const PENDING_DISABLE_KEY = "pendingCrashDisable";
const LEGACY_FEATURE_STORAGE_KEYS: Record<string, string[]> = {
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

type LegacyPendingDisable = {
	pluginName: string;
	storageKey: string;
	timestamp: number;
};

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
			errorName: "errorName" in record && typeof record.errorName === "string" ? record.errorName : undefined,
			message: "message" in record && typeof record.message === "string" ? record.message : undefined,
			fatal: "fatal" in record && typeof record.fatal === "boolean" ? record.fatal : undefined,
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
	storage.lastError = undefined;
	storage[CRASH_REASONS_KEY] = undefined;
	storage[PENDING_DISABLE_KEY] = undefined;
}

function getLegacyPendingDisables(): LegacyPendingDisable[] {
	const pendingItems: unknown = storage[PENDING_DISABLE_KEY];
	if (!Array.isArray(pendingItems)) return [];
	return pendingItems.filter(
		(pending): pending is LegacyPendingDisable =>
			typeof pending === "object" &&
			pending !== null &&
			"pluginName" in pending &&
			typeof pending.pluginName === "string" &&
			"storageKey" in pending &&
			typeof pending.storageKey === "string" &&
			LEGACY_FEATURE_STORAGE_KEYS[pending.pluginName]?.includes(pending.storageKey) === true &&
			"timestamp" in pending &&
			typeof pending.timestamp === "number" &&
			Number.isFinite(pending.timestamp),
	);
}

export async function recoverLegacyPendingDisables() {
	for (const pending of getLegacyPendingDisables()) {
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
			storage[PENDING_DISABLE_KEY] = getLegacyPendingDisables().filter(
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

export function installCrashCapture() {
	removeCrashGuard ??= installPluginCrashGuard("Tenshi's Plugins", storage);
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		removeCrashGuard?.();
		removeCrashGuard = undefined;
	};
}
