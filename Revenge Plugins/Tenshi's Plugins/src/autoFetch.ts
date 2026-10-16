import { storage } from "@vendetta/plugin";
import { clearManagerActivityFailures, recordManagerActivity } from "./activityLog";
import { claimAutoFetchStartup, type AutoFetchProgress, type AutoFetchStartupState } from "./autoFetchGate";
import { refetchInstalledPlugins } from "./pluginUpdater";

const AUTO_FETCH_REGISTRY_KEY = "__tenshiPluginsAutoFetchV1";
const AUTO_FETCH_PROGRESS_KEY = "autoFetchProgress";
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

export function getAutoFetchProgress(): AutoFetchProgress | undefined {
	const progress: unknown = storage[AUTO_FETCH_PROGRESS_KEY];
	if (typeof progress !== "object" || progress === null) return undefined;
	if (
		!("phase" in progress) ||
		(progress.phase !== "scheduled" && progress.phase !== "loading" && progress.phase !== "updating") ||
		!("completed" in progress) ||
		typeof progress.completed !== "number" ||
		!Number.isFinite(progress.completed) ||
		progress.completed < 0 ||
		!("total" in progress) ||
		typeof progress.total !== "number" ||
		!Number.isFinite(progress.total) ||
		progress.total < 0 ||
		!("pluginName" in progress) ||
		typeof progress.pluginName !== "string"
	) return undefined;
	return {
		phase: progress.phase,
		completed: progress.completed,
		total: progress.total,
		pluginName: progress.pluginName,
	};
}

function setAutoFetchProgress(progress: AutoFetchProgress | undefined) {
	storage[AUTO_FETCH_PROGRESS_KEY] = progress;
}

async function runAutoFetch() {
	setAutoFetchProgress({ phase: "loading", completed: 0, total: 0, pluginName: "" });
	clearManagerActivityFailures();
	recordManagerActivity("Automatic updates started.", "info");
	try {
		const result = await refetchInstalledPlugins({
			onProgress: (progress, total, pluginName) => {
				setAutoFetchProgress({ phase: "updating", completed: progress, total, pluginName });
				if (pluginName) console.info(`[Tenshi's Plugins] Automatically checking ${pluginName} (${progress + 1}/${total}).`);
			},
			onFailure: (pluginName, error) => {
				const details = error instanceof Error ? error.stack || error.message : String(error);
				recordManagerActivity(`${pluginName} automatic update failed.`, "failure", details);
			},
		});
		const restartAdvice = result.restartRequired.length > 0
			? `Restart Revenge to apply updates to ${result.restartRequired.join(", ")}.`
			: "";
		const metrics = {
			installedPlugins: result.total - result.available,
			repositoryPlugins: result.total,
			updatedPlugins: result.updated,
			updateTotal: result.total - result.available,
		};
		if (result.failures.length > 0) {
			recordManagerActivity(
				`Automatic updates finished with ${result.failures.length} error${result.failures.length === 1 ? "" : "s"}.${restartAdvice ? ` ${restartAdvice}` : ""}`,
				"failure",
				[result.failures.join("\n"), restartAdvice].filter(Boolean).join("\n"),
				metrics,
			);
		} else {
			recordManagerActivity(
				`Automatic updates complete.${restartAdvice ? ` ${restartAdvice}` : ""}`,
				"success",
				`Updated ${result.updated}; ${result.unchanged} unchanged; ${result.available} available.`,
				metrics,
			);
		}
	} catch (error) {
		const details = error instanceof Error ? error.stack || error.message : String(error);
		console.error("[Tenshi's Plugins] Automatic updates failed.", error);
		recordManagerActivity("Automatic updates failed.", "failure", details);
	}
}

export function scheduleAutoFetchOnStartup() {
	const registry = getRegistry();
	if (!claimAutoFetchStartup(registry, storage.autoFetchEnabled === true) || registry.running || registry.timer) return;

	storage.autoFetchInProgress = true;
	setAutoFetchProgress({ phase: "scheduled", completed: 0, total: 0, pluginName: "" });
	registry.timer = setTimeout(() => {
		registry.timer = undefined;
		if (storage.autoFetchEnabled !== true || registry.running) {
			storage.autoFetchInProgress = false;
			setAutoFetchProgress(undefined);
			return;
		}
		registry.running = true;
		void runAutoFetch().finally(() => {
			registry.running = false;
			storage.autoFetchInProgress = false;
			setAutoFetchProgress(undefined);
		});
	}, STARTUP_DELAY_MS);
}

export function clearStaleAutoFetchState() {
	const registry = getRegistry();
	if (!registry.running && !registry.timer) {
		storage.autoFetchInProgress = false;
		setAutoFetchProgress(undefined);
	}
}

export function cancelScheduledAutoFetch() {
	const registry = getRegistry();
	if (registry.timer) {
		clearTimeout(registry.timer);
		registry.timer = undefined;
		registry.startupHandled = false;
	}
	if (!registry.running) {
		storage.autoFetchInProgress = false;
		setAutoFetchProgress(undefined);
	}
}