import { plugins, startPlugin, stopPlugin } from "@vendetta/plugins";
import { discoverManagedPlugins, fetchWithRetry, type ManagedPlugin } from "./catalog";
import { acquireBulkRefetch, acquirePluginRefetch, createRefetchLockState } from "./refetchLock";
import { getPendingManagerRestart, markManagerRestartRequired } from "./restartState";

const REFRESH_LOCK_KEY = "__tenshiPluginsRefetchLockV1";

function getRefetchLock() {
	const global = globalThis as typeof globalThis & { [REFRESH_LOCK_KEY]?: ReturnType<typeof createRefetchLockState> };
	if (!global[REFRESH_LOCK_KEY]) global[REFRESH_LOCK_KEY] = createRefetchLockState();
	return global[REFRESH_LOCK_KEY]!;
}

type PluginManifest = {
	name: string;
	main?: string;
	hash: string;
	[key: string]: unknown;
};

export type InstalledPlugin = {
	key: string;
	instance: any;
};

export type RefetchHooks = {
	onCatalog?: (plugins: ManagedPlugin[]) => void;
	onProgress?: (progress: number, total: number, pluginName: string) => void;
	onFailure?: (pluginName: string, error: unknown) => void;
};

export type PluginRefetchResult = {
	updated: boolean;
	restartRequired: boolean;
};

type RuntimePlugin = {
	manifest?: { name?: string };
	[key: string]: unknown;
};

export function findInstalledPlugin(entry: ManagedPlugin): InstalledPlugin | undefined {
	for (const url of [entry.url, ...entry.legacyUrls]) {
		const instance = plugins[url];
		if (instance) return { key: url, instance };
	}

	const approvedRoots = [entry.url, ...entry.legacyUrls].map((url) => {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/\/+$/, "");
		return `${parsed.origin}${path.slice(0, path.lastIndexOf("/") + 1)}`;
	});
	for (const [url, instance] of Object.entries(plugins as Record<string, RuntimePlugin>)) {
		if (
			approvedRoots.some((root) => url.startsWith(root)) &&
			instance.manifest?.name?.toLocaleLowerCase() === entry.name.toLocaleLowerCase()
		) {
			return { key: url, instance };
		}
	}
	return undefined;
}

async function fetchPluginBundle(url: string, expectedName: string): Promise<{ manifest: PluginManifest; js: string }> {
	const baseUrl = url.endsWith("/") ? url : `${url}/`;
	const manifestResponse = await fetchWithRetry(`${baseUrl}manifest.json`);
	const manifestValue: unknown = await manifestResponse.json();
	if (
		typeof manifestValue !== "object" ||
		manifestValue === null ||
		!("name" in manifestValue) ||
		typeof manifestValue.name !== "string" ||
		manifestValue.name.toLocaleLowerCase() !== expectedName.toLocaleLowerCase() ||
		!("hash" in manifestValue) ||
		typeof manifestValue.hash !== "string" ||
		!/^[a-f\d]{64}$/i.test(manifestValue.hash) ||
		("main" in manifestValue && manifestValue.main !== undefined && typeof manifestValue.main !== "string")
	) {
		throw new Error(`The manifest at ${baseUrl} is not a valid ${expectedName} manifest.`);
	}

	const manifest = manifestValue as PluginManifest;
	const main = manifest.main || "index.js";
	if (
		main.startsWith("/") ||
		main.includes("\\") ||
		main.split("/").some((segment) => segment === ".." || segment === "")
	) {
		throw new Error(`The ${expectedName} manifest contains an unsafe bundle path.`);
	}

	const bundleResponse = await fetchWithRetry(`${baseUrl}${main}`);
	const js = await bundleResponse.text();
	if (!js.trim() || js.trimStart().startsWith("<")) {
		throw new Error(`The bundle at ${baseUrl}${main} is empty or is not JavaScript.`);
	}

	if (globalThis.crypto?.subtle && typeof TextEncoder !== "undefined") {
		try {
			const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(js));
			const actualHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
			if (actualHash.toLowerCase() !== manifest.hash.toLowerCase()) {
				throw new Error(`The downloaded ${expectedName} bundle did not match its manifest hash.`);
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes("did not match its manifest hash")) throw error;
			console.warn(`[Tenshi's Plugins] SHA-256 verification is unavailable in this runtime for ${expectedName}.`, error);
		}
	}

	return { manifest, js };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function performRefetchPlugin(entry: ManagedPlugin, installed: InstalledPlugin): Promise<PluginRefetchResult> {
	let stopped = false;
	const existingPlugin = plugins[installed.key];
	const wasEnabled = !!installed.instance.enabled;

	const sources = [...new Set([entry.url, installed.key, ...entry.legacyUrls])];
	const sourceErrors: string[] = [];
	let bundle: Awaited<ReturnType<typeof fetchPluginBundle>> | undefined;
	for (const source of sources) {
		try {
			bundle = await fetchPluginBundle(source, entry.name);
			break;
		} catch (error) {
			const failure = `${source}: ${errorMessage(error)}`;
			sourceErrors.push(failure);
			console.warn(`[Tenshi's Plugins] Could not fetch ${entry.name} from ${source}.`, error);
		}
	}
	if (!bundle) {
		throw new Error(`Could not fetch ${entry.name} from any source. ${sourceErrors.join(" | ")}`);
	}

	const manifestChanged = JSON.stringify(existingPlugin?.manifest) !== JSON.stringify(bundle.manifest);
	const bundleChanged = existingPlugin?.js !== bundle.js;
	if (!manifestChanged && !bundleChanged) return { updated: false, restartRequired: false };
	const restartRequired = entry.name === "Tenshi's Plugins" && wasEnabled && bundleChanged;
	if (restartRequired) markManagerRestartRequired(entry.name);

	try {
		if (bundleChanged && wasEnabled) {
			stopPlugin(installed.key, false);
			stopped = true;
		}

		plugins[installed.key] = {
			...plugins[installed.key],
			id: installed.key,
			manifest: bundle.manifest,
			js: bundle.js,
			enabled: wasEnabled,
			update: existingPlugin?.update ?? true,
		};

		if (stopped) {
			await startPlugin(installed.key);
			if (wasEnabled && !plugins[installed.key]?.enabled) {
				throw new Error(`${entry.name} was fetched but Revenge could not restart it.`);
			}
			stopped = false;
		}
		return { updated: true, restartRequired };
	} catch (error) {
		if (stopped) {
			try {
				await startPlugin(installed.key);
			} catch (restartError) {
				console.error(`[Tenshi's Plugins] Failed to restart ${entry.name} after refetch.`, restartError);
			}
		}
		throw error;
	}
}

export async function refetchPlugin(entry: ManagedPlugin, installed: InstalledPlugin): Promise<PluginRefetchResult> {
	const release = acquirePluginRefetch(getRefetchLock(), installed.key);
	if (!release) throw new Error("Another plugin refetch is already in progress. Try again when it finishes.");
	try {
		return await performRefetchPlugin(entry, installed);
	} finally {
		release();
	}
}

async function performRefetchInstalledPlugins(hooks: RefetchHooks) {
	const discoveredPlugins = await discoverManagedPlugins();
	const orderedPlugins = [...discoveredPlugins].sort(
		(left, right) => Number(left.name === "Tenshi's Plugins") - Number(right.name === "Tenshi's Plugins"),
	);
	hooks.onCatalog?.(orderedPlugins);
	const targets = orderedPlugins
		.map((entry) => ({ entry, installed: findInstalledPlugin(entry) }))
		.filter(
			(target): target is { entry: ManagedPlugin; installed: InstalledPlugin } => target.installed !== undefined,
		);
	const parallelTargets = targets.filter(({ entry }) => entry.name !== "Tenshi's Plugins");
	const managerTarget = targets.find(({ entry }) => entry.name === "Tenshi's Plugins");
	const failures: string[] = [];
	const restartRequired = new Set<string>();
	let updated = 0;
	let unchanged = 0;
	let completed = orderedPlugins.length - targets.length;
	hooks.onProgress?.(completed, orderedPlugins.length, "");
	let nextIndex = 0;

	const worker = async () => {
		while (nextIndex < parallelTargets.length) {
			const target = parallelTargets[nextIndex++];
			hooks.onProgress?.(completed, orderedPlugins.length, target.entry.name);
			try {
				const result = await performRefetchPlugin(target.entry, target.installed);
				if (result.updated) updated++;
				else unchanged++;
				if (result.restartRequired) restartRequired.add(target.entry.name);
			} catch (error) {
				failures.push(`${target.entry.name}: ${errorMessage(error)}`);
				console.error(`[Tenshi's Plugins] Fetch All failed for ${target.entry.name}.`, error);
				hooks.onFailure?.(target.entry.name, error);
			}
			completed++;
			hooks.onProgress?.(completed, orderedPlugins.length, target.entry.name);
		}
	};

	await Promise.all(Array.from({ length: Math.min(3, parallelTargets.length) }, () => worker()));
	if (managerTarget) {
		hooks.onProgress?.(completed, orderedPlugins.length, managerTarget.entry.name);
		try {
			const result = await performRefetchPlugin(managerTarget.entry, managerTarget.installed);
			if (result.updated) updated++;
			else unchanged++;
			if (result.restartRequired) restartRequired.add(managerTarget.entry.name);
		} catch (error) {
			failures.push(`${managerTarget.entry.name}: ${errorMessage(error)}`);
			console.error(`[Tenshi's Plugins] Fetch All failed for ${managerTarget.entry.name}.`, error);
			hooks.onFailure?.(managerTarget.entry.name, error);
		}
		completed++;
		hooks.onProgress?.(completed, orderedPlugins.length, managerTarget.entry.name);
	}

	return {
		plugins: orderedPlugins,
		total: orderedPlugins.length,
		available: orderedPlugins.length - targets.length,
		updated,
		unchanged,
		failures,
		restartRequired: [...new Set([...restartRequired, ...(getPendingManagerRestart()?.pluginNames ?? [])])],
	};
}

export async function refetchInstalledPlugins(hooks: RefetchHooks = {}) {
	const release = acquireBulkRefetch(getRefetchLock());
	if (!release) throw new Error("Another plugin refetch is already in progress. Try again when it finishes.");
	try {
		return await performRefetchInstalledPlugins(hooks);
	} finally {
		release();
	}
}