import { storage } from "@vendetta/plugin";
import { recordManagerActivity } from "./activityLog";
import { claimAutoFetchStartup, type AutoFetchStartupState } from "./autoFetchGate";
import { refetchInstalledPlugins } from "./pluginUpdater";

const AUTO_FETCH_REGISTRY_KEY = "__tenshiPluginsAutoFetchV1";
const STARTUP_DELAY_MS = 3000;

type AutoFetchRegistry = AutoFetchStartupState & {
	running: boolean;
	timer?: ReturnType<typeof setTimeout>;
};

function getRegistry(): AutoFetchRegistry {
	const global = globalThis as typeof globalThis & { [AUTO_FETCH_REGISTRY_KEY]?: AutoFetchRegistry };
	if (!global[AUTO_FETCH_REGISTRY_KEY]) {
		global[AUTO_FETCH_REGISTRY_KEY] = { running: false, startupHandled: false };
	}
	return global[AUTO_FETCH_REGISTRY_KEY]!;
}

async function runAutoFetch() {
	recordManagerActivity("Automatic plugin refetch started", "info");
	try {
		const result = await refetchInstalledPlugins({
			onProgress: (progress, total, pluginName) => {
				if (pluginName) console.info(`[Tenshi's Plugins] Automatically checking ${pluginName} (${progress + 1}/${total}).`);
			},
			onFailure: (pluginName, error) => {
				const details = error instanceof Error ? error.stack || error.message : String(error);
				recordManagerActivity(`${pluginName} automatic refetch failed`, "failure", details);
			},
		});
		const restartAdvice = result.restartRequired.length > 0
			? `Restart Revenge to load updates for ${result.restartRequired.join(", ")}.`
			: "";
		if (result.failures.length > 0) {
			recordManagerActivity(
				`Automatic refetch finished with ${result.failures.length} failure${result.failures.length === 1 ? "" : "s"}.${restartAdvice ? ` ${restartAdvice}` : ""}`,
				"failure",
				[result.failures.join("\n"), restartAdvice].filter(Boolean).join("\n"),
			);
		} else {
			recordManagerActivity(
				`Automatic refetch finished: ${result.updated} updated, ${result.unchanged} unchanged, ${result.available} available.${restartAdvice ? ` ${restartAdvice}` : ""}`,
				"success",
			);
		}
	} catch (error) {
		const details = error instanceof Error ? error.stack || error.message : String(error);
		console.error("[Tenshi's Plugins] Automatic plugin refetch failed.", error);
		recordManagerActivity("Automatic plugin refetch failed", "failure", details);
	}
}

export function scheduleAutoFetchOnStartup() {
	const registry = getRegistry();
	if (!claimAutoFetchStartup(registry, storage.autoFetchEnabled === true) || registry.running || registry.timer) return;

	storage.autoFetchInProgress = true;
	registry.timer = setTimeout(() => {
		registry.timer = undefined;
		if (storage.autoFetchEnabled !== true || registry.running) {
			storage.autoFetchInProgress = false;
			return;
		}
		registry.running = true;
		void runAutoFetch().finally(() => {
			registry.running = false;
			storage.autoFetchInProgress = false;
		});
	}, STARTUP_DELAY_MS);
}

export function clearStaleAutoFetchState() {
	const registry = getRegistry();
	if (!registry.running && !registry.timer) storage.autoFetchInProgress = false;
}

export function cancelScheduledAutoFetch() {
	const registry = getRegistry();
	if (!registry.timer) return;
	clearTimeout(registry.timer);
	registry.timer = undefined;
	registry.startupHandled = false;
	storage.autoFetchInProgress = false;
}