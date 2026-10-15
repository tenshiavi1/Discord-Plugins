import { findByProps } from "../../compat";
import { clipboard, NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { getSettings, installPlugin, plugins, removePlugin, startPlugin, stopPlugin } from "@vendetta/plugins";
import { createMMKVBackend } from "@vendetta/storage";
import { useProxy } from "@vendetta/storage";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import StableTextInput from "../../StableTextInput";
import { showToast } from "../../shared/toast";
import { discoverManagedPlugins, fetchWithRetry, MANAGED_PLUGINS, type ManagedPlugin } from "./catalog";
import { clearLastCrash, getCrashReasons, getLastCrash } from "./crashLog";
import { reloadAndReturnToManager } from "./managerNavigation";

const { TableRow, TableRowGroup } = findByProps("TableRow", "TableRowGroup");
const showSimpleActionSheet = findByProps("showSimpleActionSheet")?.showSimpleActionSheet;
const hideActionSheet = findByProps("openLazy", "hideActionSheet")?.hideActionSheet;

type PluginManifest = {
	name: string;
	main?: string;
	hash: string;
	[key: string]: unknown;
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

type ManagerActivityStatus = "success" | "failure" | "info";

type ManagerActivityRecord = {
	timestamp: number;
	status: ManagerActivityStatus;
	summary: string;
	details?: string;
};

const MANAGER_ACTIVITY_KEY = "managerActivity";
const MANAGER_ACTIVITY_LIMIT = 50;
const MANAGER_ACTIVITY_DETAIL_LIMIT = 8000;

function isManagerActivityRecord(record: unknown): record is ManagerActivityRecord {
	if (typeof record !== "object" || record === null) return false;
	if (
		!("timestamp" in record) ||
		typeof record.timestamp !== "number" ||
		!Number.isFinite(record.timestamp) ||
		Math.abs(record.timestamp) > 8.64e15
	) return false;
	if (!("status" in record) || !["success", "failure", "info"].includes(String(record.status))) return false;
	if (!("summary" in record) || typeof record.summary !== "string") return false;
	return !("details" in record) || typeof record.details === "string";
}

function getManagerActivity(): ManagerActivityRecord[] {
	const records: unknown = storage[MANAGER_ACTIVITY_KEY];
	return Array.isArray(records)
		? records.filter(isManagerActivityRecord).slice(0, MANAGER_ACTIVITY_LIMIT)
		: [];
}

function errorDetails(error: unknown): string {
	if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
	return String(error);
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
		!("main" in manifestValue && manifestValue.main !== undefined && typeof manifestValue.main !== "string")
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

function findStackNavigation(navigation: any) {
	let current = navigation;
	while (current) {
		if (typeof current.push === "function") return current;
		current = current.getParent?.();
	}
	return undefined;
}

function findInstalledPlugin(entry: ManagedPlugin) {
	for (const url of [entry.url, ...entry.legacyUrls]) {
		const instance = plugins[url];
		if (instance) return { key: url, instance };
	}

	const approvedRoots = [entry.url, ...entry.legacyUrls].map((url) => {
		const parsed = new URL(url);
		const path = parsed.pathname.replace(/\/+$/, "");
		return `${parsed.origin}${path.slice(0, path.lastIndexOf("/") + 1)}`;
	});
	for (const [url, instance] of Object.entries(plugins)) {
		if (
			approvedRoots.some((root) => url.startsWith(root)) &&
			instance.manifest?.name?.toLocaleLowerCase() === entry.name.toLocaleLowerCase()
		) {
			return { key: url, instance };
		}
	}
	return undefined;
}

function getPluginSettings(installed: NonNullable<ReturnType<typeof findInstalledPlugin>>) {
	return getSettings(installed.instance?.id ?? installed.key);
}

function IconButton({
	assetNames,
	fallback,
	label,
	onPress,
	disabled,
}: {
	assetNames: string[];
	fallback: string;
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	const icon = assetNames.map(getAssetIDByName).find(Boolean);
	return (
		<RN.TouchableOpacity
			accessibilityLabel={label}
			accessibilityRole="button"
			disabled={disabled}
			onPress={onPress}
			style={{
				width: 36,
				height: 36,
				alignItems: "center",
				justifyContent: "center",
				borderRadius: 12,
				backgroundColor: "#292b38",
				opacity: disabled ? 0.4 : 1,
			}}
		>
			{icon
				? <RN.Image source={icon} style={{ width: 20, height: 20, tintColor: "#f2f3f5" }} />
				: <RN.Text style={{ color: "#f2f3f5", fontSize: 20 }}>{fallback}</RN.Text>}
		</RN.TouchableOpacity>
	);
}

export default function Settings() {
	useProxy(plugins);
	useProxy(storage);
	const [busy, setBusy] = React.useState<Record<string, boolean>>({});
	const [fetchingAll, setFetchingAll] = React.useState(false);
	const [fetchProgress, setFetchProgress] = React.useState(0);
	const [fetchTotal, setFetchTotal] = React.useState(0);
	const [activityLog, setActivityLog] = React.useState<ManagerActivityRecord[]>(getManagerActivity);
	const [activityStatus, setActivityStatus] = React.useState("");
	const [catalog, setCatalog] = React.useState(MANAGED_PLUGINS);
	const [searchQuery, setSearchQuery] = React.useState("");
	const [searchInputReset, setSearchInputReset] = React.useState(0);
	const navigation = NavigationNative.useNavigation();
	const { width: screenWidth, fontScale } = RN.useWindowDimensions();
	const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
	const lastCrash = getLastCrash();
	const formatCrashDate = (timestamp: number) => {
		const crashTime = new Date(timestamp);
		const date = crashTime.toLocaleDateString("en-US", {
			month: "2-digit",
			day: "2-digit",
			year: "numeric",
		});
		const time = crashTime.toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		});
		return `${date} ${time}`;
	};
	const crashDate = lastCrash ? formatCrashDate(lastCrash.timestamp) : undefined;
	const storedCrashReasons = getCrashReasons();
	const crashReasons = storedCrashReasons.length > 0
		? storedCrashReasons
		: lastCrash && lastCrash.pluginName !== "Unknown plugin"
			? [{ pluginName: lastCrash.pluginName, timestamp: lastCrash.timestamp }]
			: [];
	const visiblePlugins = catalog
		.filter((entry) =>
			!normalizedQuery ||
			normalizedQuery.split(/\s+/).every((term) =>
				`${entry.name} ${entry.description} ${entry.searchTerms}`.toLocaleLowerCase().includes(term),
			),
		)
		.sort((left, right) => left.name.localeCompare(right.name));

	const recordActivity = (
		summary: string,
		status: ManagerActivityStatus,
		details?: string,
	) => {
		const record: ManagerActivityRecord = {
			timestamp: Date.now(),
			status,
			summary,
			details: details?.slice(0, MANAGER_ACTIVITY_DETAIL_LIMIT),
		};
		const next = [record, ...getManagerActivity()].slice(0, MANAGER_ACTIVITY_LIMIT);
		storage[MANAGER_ACTIVITY_KEY] = next;
		setActivityLog(next);
	};

	const formatActivityLog = () => activityLog
		.map((record) => {
			const timestamp = new Date(record.timestamp).toISOString();
			return `[${timestamp}] ${record.status.toUpperCase()}: ${record.summary}${record.details ? `\n${record.details}` : ""}`;
		})
		.join("\n\n");

	const changePlugin = async (entry: ManagedPlugin) => {
		if (busy[entry.url]) return;
		setBusy((current) => ({ ...current, [entry.url]: true }));
		const installed = findInstalledPlugin(entry);
		const action = installed ? "Remove" : "Install";
		setActivityStatus(`${action} ${entry.name}…`);

		try {
			if (installed) {
				await removePlugin(installed.key);
				recordActivity(`${entry.name} removed`, "success");
				showToast(`${entry.name} was removed.`, getAssetIDByName("Check"));
			} else {
				await installPlugin(entry.url, true);
				recordActivity(`${entry.name} installed`, "success");
				showToast(`${entry.name} was installed.`, getAssetIDByName("Check"));
			}
		} catch (error) {
			console.error(`[Tenshi's Plugins] Failed to ${installed ? "delete" : "install"} ${entry.name}.`, error);
			recordActivity(`${action} ${entry.name} failed`, "failure", errorDetails(error));
			showToast(
				`Could not ${action.toLocaleLowerCase()} ${entry.name}. Check the activity log for details.`,
				getAssetIDByName("Warning"),
			);
		} finally {
			setActivityStatus("");
			setBusy((current) => ({ ...current, [entry.url]: false }));
		}
	};

	const refetchPlugin = async (
		entry: ManagedPlugin,
		installed: NonNullable<ReturnType<typeof findInstalledPlugin>>,
	): Promise<boolean> => {
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
		if (!manifestChanged && !bundleChanged) return false;

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
			return true;
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
	};

	const clearPluginData = async (
		entry: ManagedPlugin,
		installed: NonNullable<ReturnType<typeof findInstalledPlugin>>,
	) => {
		const wasEnabled = !!installed.instance.enabled;
		let stopped = false;
		try {
			if (wasEnabled) {
				stopPlugin(installed.key, false);
				stopped = true;
			}
			await createMMKVBackend(installed.key).set({});
			if (stopped) {
				await startPlugin(installed.key);
				stopped = false;
			}
		} catch (error) {
			if (stopped) {
				try {
					await startPlugin(installed.key);
				} catch (restartError) {
					console.error(`[Tenshi's Plugins] Failed to restart ${entry.name} after clearing data.`, restartError);
				}
			}
			throw error;
		}
	};

	const fetchAllPlugins = async () => {
		if (fetchingAll || Object.values(busy).some(Boolean)) return;
		setFetchingAll(true);
		setFetchProgress(0);
		setFetchTotal(0);
		setActivityStatus("Loading plugin catalog…");
		recordActivity("Fetch All started", "info");
		const failedPlugins: string[] = [];
		try {
			const discoveredPlugins = await discoverManagedPlugins();
			setCatalog(discoveredPlugins);
			setFetchTotal(discoveredPlugins.length);
			const orderedPlugins = [...discoveredPlugins].sort(
				(left, right) => Number(left.name === "Tenshi's Plugins") - Number(right.name === "Tenshi's Plugins"),
			);
			let updatedCount = 0;
			let unchangedCount = 0;
			let availableCount = 0;
			const targets = orderedPlugins
				.map((entry) => ({ entry, installed: findInstalledPlugin(entry) }))
				.filter(
					(target): target is {
						entry: ManagedPlugin;
						installed: NonNullable<ReturnType<typeof findInstalledPlugin>>;
					} => target.installed !== undefined,
				);
			availableCount = orderedPlugins.length - targets.length;
			setFetchTotal(orderedPlugins.length);
			let nextTargetIndex = 0;
			let completedCount = availableCount;
			const parallelTargets = targets.filter(({ entry }) => entry.name !== "Tenshi's Plugins");
			const managerTarget = targets.find(({ entry }) => entry.name === "Tenshi's Plugins");
			setFetchProgress(availableCount);

			const worker = async () => {
				while (nextTargetIndex < parallelTargets.length) {
					const target = parallelTargets[nextTargetIndex++];
					setActivityStatus(`Fetching ${target.entry.name}…`);
					try {
						if (await refetchPlugin(target.entry, target.installed)) updatedCount++;
						else unchangedCount++;
					} catch (error) {
						console.error(`[Tenshi's Plugins] Fetch All failed for ${target.entry.name}.`, error);
						const failure = `${target.entry.name}: ${errorMessage(error)}`;
						failedPlugins.push(failure);
						recordActivity(`${target.entry.name} fetch failed`, "failure", errorDetails(error));
					} finally {
						completedCount++;
						setFetchProgress(completedCount);
					}
				}
			};

			await Promise.all(
				Array.from({ length: Math.min(3, parallelTargets.length) }, () => worker()),
			);
			if (managerTarget) {
				setActivityStatus(`Fetching ${managerTarget.entry.name}…`);
				try {
					if (await refetchPlugin(managerTarget.entry, managerTarget.installed)) updatedCount++;
					else unchangedCount++;
				} catch (error) {
					console.error(`[Tenshi's Plugins] Fetch All failed for ${managerTarget.entry.name}.`, error);
					const failure = `${managerTarget.entry.name}: ${errorMessage(error)}`;
					failedPlugins.push(failure);
					recordActivity(`${managerTarget.entry.name} fetch failed`, "failure", errorDetails(error));
				} finally {
					completedCount++;
					setFetchProgress(completedCount);
				}
			}
			setFetchProgress(orderedPlugins.length);

			if (failedPlugins.length > 0) {
				recordActivity(
					`Fetch All finished with ${failedPlugins.length} failure${failedPlugins.length === 1 ? "" : "s"}`,
					"failure",
					failedPlugins.join("\n"),
				);
				showToast(
					`Fetch finished with ${failedPlugins.length} error${failedPlugins.length === 1 ? "" : "s"}. See the activity log.`,
					getAssetIDByName("Warning"),
				);
			} else {
				recordActivity(
					`Fetch All finished: ${updatedCount} updated, ${unchangedCount} unchanged, ${availableCount} available`,
					"success",
				);
				showToast(
					`Fetch complete: ${updatedCount} updated, ${unchangedCount} current, ${availableCount} available.`,
					getAssetIDByName("Check"),
				);
			}
		} catch (error) {
			console.error("[Tenshi's Plugins] Failed to fetch the plugin catalog.", error);
			recordActivity("Fetch All failed", "failure", errorDetails(error));
			showToast("Could not refresh the plugin catalog. Check your connection and try again.", getAssetIDByName("Warning"));
		} finally {
			setActivityStatus("");
			setFetchingAll(false);
		}
	};

	const confirmFetchAll = () => {
		showConfirmationAlert({
			title: "Fetch All Plugins?",
			content: "This refreshes the plugin list from the repository and refetches plugins already installed. New plugins will appear with an Install button and will not be installed automatically. Installed plugins may briefly stop while they are updated.",
			confirmText: "Fetch All",
			cancelText: "Cancel",
			onConfirm: () => { void fetchAllPlugins(); },
		});
	};

	type BulkAction = "install" | "remove" | "clear";

	const runBulkAction = async (action: BulkAction) => {
		if (fetchingAll || Object.values(busy).some(Boolean)) return;
		const targets = catalog.filter((entry) => {
			const installed = findInstalledPlugin(entry);
			return action === "install" ? !installed : !!installed;
		});
		if (targets.length === 0) {
			recordActivity(`${action} All skipped`, "info", "No plugins matched this action.");
			showToast(
				action === "install"
					? "Every plugin in the catalog is already installed."
					: "There are no installed plugins available for this action.",
				getAssetIDByName("Check"),
			);
			return;
		}

		setFetchingAll(true);
		setFetchProgress(0);
		setFetchTotal(targets.length);
		const actionLabel = `${action.charAt(0).toUpperCase()}${action.slice(1)} All`;
		setActivityStatus(`${actionLabel}…`);
		recordActivity(`${actionLabel} started`, "info", `${targets.length} plugin${targets.length === 1 ? "" : "s"} queued.`);
		const orderedTargets = [...targets].sort(
			(left, right) => Number(left.name === "Tenshi's Plugins") - Number(right.name === "Tenshi's Plugins"),
		);
		let completed = 0;
		const failedPlugins: string[] = [];

		try {
			for (const [index, entry] of orderedTargets.entries()) {
				setFetchProgress(index + 1);
				setActivityStatus(`${actionLabel}: ${entry.name}…`);
				const installed = findInstalledPlugin(entry);
				try {
					if (action === "install") {
						if (!installed) await installPlugin(entry.url, true);
						else continue;
					} else if (!installed) {
						continue;
					} else if (action === "remove") {
						await removePlugin(installed.key);
					} else {
						await clearPluginData(entry, installed);
					}
					completed += 1;
				} catch (error) {
					console.error(`[Tenshi's Plugins] Failed to ${action} ${entry.name} during bulk management.`, error);
					failedPlugins.push(entry.name);
					recordActivity(`${actionLabel}: ${entry.name} failed`, "failure", errorDetails(error));
				}
			}
			if (action === "clear") {
				try {
					clearLastCrash();
				} catch (error) {
					console.error("[Tenshi's Plugins] Failed to clear the last crash log.", error);
					failedPlugins.push("Last crash log");
					recordActivity("Clear All: crash log failed", "failure", errorDetails(error));
				}
			}
		} finally {
			setActivityStatus("");
			setFetchingAll(false);
		}

		const completionMessage = action === "install"
			? `${completed} installed`
			: action === "remove"
				? `${completed} removed`
				: `${completed} cleared`;
		if (failedPlugins.length > 0) {
			recordActivity(`${actionLabel} partially completed: ${completionMessage}`, "failure", `Failed: ${failedPlugins.join(", ")}`);
			showToast(
				`${actionLabel} partly completed: ${completionMessage}; ${failedPlugins.length} failed. See the activity log.`,
				getAssetIDByName("Warning"),
			);
		} else {
			recordActivity(`${actionLabel} complete: ${completionMessage}`, "success");
			showToast(`${actionLabel} complete: ${completionMessage}.`, getAssetIDByName("Check"));
		}
	};

	const confirmBulkAction = (action: BulkAction) => {
		const confirmation = {
			install: {
				title: "Install All Plugins?",
				content: "This will install every plugin in the list that is not already installed. Existing installations will be left unchanged.",
				confirmText: "Install All",
			},
			remove: {
				title: "Remove All Plugins?",
				content: "This will uninstall every installed plugin in the list, including Tenshi's Plugins. You may need to reopen settings after removing the manager.",
				confirmText: "Remove All",
			},
			clear: {
				title: "Clear All Plugin Data?",
				content: "This permanently clears saved settings and data for every installed plugin in the list, including the last crash log. This cannot be undone, and enabled plugins may briefly stop and restart.",
				confirmText: "Clear All",
			},
		}[action];
		showConfirmationAlert({
			...confirmation,
			cancelText: "Cancel",
			onConfirm: () => { void runBulkAction(action); },
		});
	};

	const showManageActions = () => {
		if (!showSimpleActionSheet) {
			console.error("[Tenshi's Plugins] Revenge's plugin action sheet is unavailable.");
			showToast("Could not open plugin management actions because the action menu is unavailable.", getAssetIDByName("Warning"));
			return;
		}

		showSimpleActionSheet({
			key: "ManagePlugins",
			header: {
				title: "Manage Plugins",
				subtitle: "Choose an action to perform.",
				onClose: hideActionSheet,
			},
			options: [
				{
					label: "Fetch All",
					icon: getAssetIDByName("RetryIcon"),
					onPress: () => {
						hideActionSheet?.();
						confirmFetchAll();
					},
				},
				{
					label: "Install All",
					icon: getAssetIDByName("DownloadIcon"),
					onPress: () => {
						hideActionSheet?.();
						confirmBulkAction("install");
					},
				},
				{
					label: "Remove All",
					icon: getAssetIDByName("TrashIcon"),
					isDestructive: true,
					onPress: () => {
						hideActionSheet?.();
						confirmBulkAction("remove");
					},
				},
				{
					label: "Clear All",
					icon: getAssetIDByName("CopyIcon"),
					isDestructive: true,
					onPress: () => {
						hideActionSheet?.();
						confirmBulkAction("clear");
					},
				},
			],
		});
	};

	const confirmRestart = () => {
		showConfirmationAlert({
			title: "Restart Discord?",
			content: "Discord will restart.",
			confirmText: "Okay",
			cancelText: "Cancel",
			onConfirm: () => {
				try {
					recordActivity("Discord restart requested", "info");
					reloadAndReturnToManager();
				} catch (error) {
					console.error("[Tenshi's Plugins] Could not reload Revenge.", error);
					recordActivity("Discord restart failed", "failure", errorDetails(error));
					showToast("Could not restart Revenge. Check the console for details.", getAssetIDByName("Warning"));
				}
			},
		});
	};

	const confirmDelete = (entry: ManagedPlugin) => {
		showConfirmationAlert({
			title: `Delete ${entry.name}?`,
			content: "This removes the plugin from Revenge. You can install it again from this list.",
			confirmText: "Delete",
			cancelText: "Cancel",
			onConfirm: () => { void changePlugin(entry); },
		});
	};

	const openPluginSettings = (entry: ManagedPlugin) => {
		const installed = findInstalledPlugin(entry);
		if (!installed) return;

		const PluginSettings = getPluginSettings(installed);
		if (!PluginSettings) {
			showToast(`${entry.name} does not provide a settings page.`, getAssetIDByName("Warning"));
			return;
		}
		const stackNavigation = findStackNavigation(navigation);
		if (!stackNavigation) {
			console.error("[Tenshi's Plugins] Stack navigation is unavailable for plugin settings.");
			showToast("Could not open plugin settings because the settings navigation is unavailable.", getAssetIDByName("Warning"));
			return;
		}

		stackNavigation.push("VendettaCustomPage", {
			title: entry.name,
			render: () => React.createElement(PluginSettings),
		});
	};

	const confirmClearData = (entry: ManagedPlugin, installed: NonNullable<ReturnType<typeof findInstalledPlugin>>) => {
		showConfirmationAlert({
			title: `Clear ${entry.name} data?`,
			content: "This permanently removes this plugin's saved settings and data.",
			confirmText: "Clear Data",
			cancelText: "Cancel",
			onConfirm: () => {
				void (async () => {
					setActivityStatus(`Clearing ${entry.name} data…`);
					try {
						await clearPluginData(entry, installed);
						recordActivity(`${entry.name} data cleared`, "success");
						showToast(`Cleared the saved data for ${entry.name}.`, getAssetIDByName("Check"));
					} catch (error) {
						console.error(`[Tenshi's Plugins] Failed to clear ${entry.name} data.`, error);
						recordActivity(`Clear ${entry.name} data failed`, "failure", errorDetails(error));
						showToast(`Could not clear ${entry.name} data. See the activity log.`, getAssetIDByName("Warning"));
					} finally {
						setActivityStatus("");
					}
				})();
			},
		});
	};

	const showPluginActions = (entry: ManagedPlugin) => {
		const installed = findInstalledPlugin(entry);
		if (!showSimpleActionSheet) {
			console.error("[Tenshi's Plugins] Revenge's plugin action sheet is unavailable.");
			showToast("Could not open plugin actions because the action menu is unavailable.", getAssetIDByName("Warning"));
			return;
		}

		const options = [];
		const PluginSettings = installed ? getPluginSettings(installed) : undefined;

		if (PluginSettings && installed) {
			options.push({
				label: "Configure",
				icon: getAssetIDByName("WrenchIcon"),
				onPress: () => {
					hideActionSheet?.();
					openPluginSettings(entry);
				},
			});
		}

		if (installed) {
			options.push(
				{
					label: "Refetch",
					icon: getAssetIDByName("RetryIcon"),
					onPress: () => {
						hideActionSheet?.();
						void (async () => {
							setActivityStatus(`Fetching ${entry.name}…`);
							recordActivity(`${entry.name} refetch started`, "info");
							try {
								const updated = await refetchPlugin(entry, installed);
								recordActivity(
									updated ? `${entry.name} refetched` : `${entry.name} is already up to date`,
									"success",
								);
								showToast(
									updated
										? `${entry.name} was refreshed successfully.`
										: `${entry.name} is already up to date.`,
									getAssetIDByName("Check"),
								);
							} catch (error) {
								console.error(`[Tenshi's Plugins] Failed to refetch ${entry.name}.`, error);
								recordActivity(`${entry.name} refetch failed`, "failure", errorDetails(error));
								showToast(
									`Could not refresh ${entry.name}. See the activity log.`,
									getAssetIDByName("Warning"),
								);
							} finally {
								setActivityStatus("");
							}
						})();
					},
				},
				{
					label: "Copy URL",
					icon: getAssetIDByName("LinkIcon"),
					onPress: () => {
						try {
							clipboard.setString(installed.key);
							recordActivity(`${entry.name} install URL copied`, "success");
							showToast(`Copied the install URL for ${entry.name}.`, getAssetIDByName("Check"));
						} catch (error) {
							console.error(`[Tenshi's Plugins] Could not copy the install URL for ${entry.name}.`, error);
							recordActivity(`Copy ${entry.name} URL failed`, "failure", errorDetails(error));
							showToast(`Could not copy ${entry.name}'s URL.`, getAssetIDByName("Warning"));
						}
					},
				},
				{
					label: installed.instance.update === false ? "Enable Updates" : "Disable Updates",
					icon: getAssetIDByName("DownloadIcon"),
					onPress: () => {
						installed.instance.update = installed.instance.update === false;
						recordActivity(
							`Automatic updates ${installed.instance.update ? "enabled" : "disabled"} for ${entry.name}`,
							"success",
						);
						showToast(
							`Automatic updates for ${entry.name} are ${installed.instance.update ? "enabled" : "disabled"}.`,
							getAssetIDByName("Check"),
						);
					},
				},
				{
					label: "Clear Data",
					icon: getAssetIDByName("CopyIcon"),
					isDestructive: true,
					onPress: () => {
						hideActionSheet?.();
						confirmClearData(entry, installed);
					},
				},
				{
					label: "Delete",
					icon: getAssetIDByName("TrashIcon"),
					isDestructive: true,
					onPress: () => {
						hideActionSheet?.();
						confirmDelete(entry);
					},
				},
			);
		} else {
			options.push({
				label: "Install",
				icon: getAssetIDByName("DownloadIcon"),
				onPress: () => {
					hideActionSheet?.();
					void changePlugin(entry);
				},
			});
		}

		showSimpleActionSheet({
			key: "CardOverflow",
			header: {
				title: entry.name,
				subtitle: entry.description,
				onClose: hideActionSheet,
			},
			options,
		});
	};

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
			<RN.View
				style={{
					flexDirection: "row",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 12,
					padding: 10,
					borderRadius: 16,
					backgroundColor: "#2b2d31",
				}}
			>
				<RN.View style={{ flexDirection: "row", alignItems: "center" }}>
					<RN.TouchableOpacity
						accessibilityLabel="Manage Plugins"
						accessibilityRole="button"
						disabled={fetchingAll || Object.values(busy).some(Boolean)}
						onPress={showManageActions}
						style={{
							minHeight: 40,
							paddingHorizontal: 12,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: "#5865f2",
							opacity: fetchingAll || Object.values(busy).some(Boolean) ? 0.6 : 1,
						}}
					>
						<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>Manage</RN.Text>
					</RN.TouchableOpacity>
					<RN.View style={{ width: 8 }} />
					<RN.TouchableOpacity
						accessibilityLabel="Restart Revenge and return to Tenshi's Plugins"
						accessibilityRole="button"
						disabled={fetchingAll}
						onPress={confirmRestart}
						style={{
							minHeight: 40,
							paddingHorizontal: 12,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: "#ed4245",
							opacity: fetchingAll ? 0.6 : 1,
						}}
					>
						<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>Restart</RN.Text>
					</RN.TouchableOpacity>
				</RN.View>
			</RN.View>
			<RN.View
				style={{
					flexDirection: "row",
					alignItems: "center",
					marginBottom: 12,
					paddingHorizontal: 12,
					borderRadius: 16,
					backgroundColor: "#2b2d31",
				}}
			>
				<StableTextInput
					accessibilityLabel="Search plugins"
					placeholder="Search Plugins by Name or Description"
					value={searchQuery}
					onChangeText={setSearchQuery}
					resetKey={searchInputReset}
					returnKeyType="search"
					style={{ flex: 1, minHeight: 44, color: "#f2f3f5" }}
				/>
				{searchQuery.length > 0 && (
					<RN.TouchableOpacity
						accessibilityLabel="Clear Plugin Search"
						accessibilityRole="button"
						onPress={() => {
							setSearchQuery("");
							setSearchInputReset((current) => current + 1);
						}}
						style={{ padding: 8 }}
					>
						<RN.Text style={{ color: "#b5bac1", fontSize: 16 }}>Clear</RN.Text>
					</RN.TouchableOpacity>
				)}
			</RN.View>
			<RN.View
				style={{
					marginBottom: 12,
					padding: 12,
					borderRadius: 12,
					backgroundColor: "#2b2d31",
				}}
			>
				<RN.Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "600", marginBottom: 8 }}>
					Manager Activity
				</RN.Text>
				<RN.View
					accessibilityRole={fetchingAll ? "progressbar" : undefined}
					accessibilityLabel={fetchingAll ? `Plugin operation progress: ${fetchProgress} of ${fetchTotal}` : undefined}
					style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
				>
					{(fetchingAll || Object.values(busy).some(Boolean)) && <RN.ActivityIndicator size="small" />}
					<RN.Text style={{ color: "#dbdee1", marginLeft: 8, flex: 1 }}>
						{activityStatus || activityLog[0]?.summary || "No manager activity recorded."}
						{fetchingAll && fetchTotal > 0 ? ` (${fetchProgress}/${fetchTotal})` : ""}
					</RN.Text>
				</RN.View>
				{activityLog.slice(0, 5).map((record, index) => (
					<RN.View key={`${record.timestamp}-${index}`} style={{ marginBottom: 8 }}>
						<RN.Text
							selectable
							style={{
								color: record.status === "failure" ? "#f38ba8" : "#b5bac1",
								fontSize: 12,
								fontFamily: "monospace",
							}}
						>
							{`${formatCrashDate(record.timestamp)} · ${record.status.toUpperCase()} · ${record.summary}`}
						</RN.Text>
						{record.details && (
							<RN.Text
								selectable
								numberOfLines={3}
								style={{ color: "#b5bac1", fontSize: 11, marginTop: 2 }}
							>
								{record.details}
							</RN.Text>
						)}
					</RN.View>
				))}
				<RN.TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel="Copy manager activity log"
					disabled={activityLog.length === 0}
					onPress={() => {
						try {
							clipboard.setString(formatActivityLog());
							showToast("Copied the manager activity log.", getAssetIDByName("Check"));
						} catch (error) {
							console.error("[Tenshi's Plugins] Could not copy the manager activity log.", error);
							showToast("Could not copy the activity log.", getAssetIDByName("Warning"));
						}
					}}
					style={{
						minHeight: 40,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 8,
						backgroundColor: "#292b38",
						opacity: activityLog.length === 0 ? 0.55 : 1,
					}}
				>
					<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Copy Activity Log</RN.Text>
				</RN.TouchableOpacity>
			</RN.View>
			<RN.View
				style={{
					marginBottom: 16,
					padding: 12,
					borderRadius: 8,
					borderWidth: 1,
					borderColor: "#343946",
					backgroundColor: "#2b2d31",
				}}
			>
				<RN.Text
					style={{
						color: "#d8dee9",
						fontFamily: "monospace",
						fontSize: 14,
					}}
				>
					{lastCrash
						? `Last Crash: ${lastCrash.pluginName} ${crashDate}`
						: "Last Crash: None Recorded"}
				</RN.Text>
				<RN.Text
					style={{
						marginTop: 4,
						marginBottom: 10,
						color: "#d8dee9",
						fontFamily: "monospace",
						fontSize: 14,
					}}
				>
					{crashReasons.length > 0
						? `Crash Reason: ${crashReasons
							.map((reason) => `${reason.pluginName} (${formatCrashDate(reason.timestamp)})`)
							.join(", ")}`
						: "Crash Reason: None Recorded"}
				</RN.Text>
				<RN.TouchableOpacity
					accessibilityLabel="Copy last crash logs"
					accessibilityRole="button"
					disabled={!lastCrash}
					onPress={() => {
						if (!lastCrash) return;
						try {
							clipboard.setString(lastCrash.logs);
							showToast("Copied the last crash log to your clipboard.", getAssetIDByName("Check"));
						} catch (error) {
							console.error("[Tenshi's Plugins] Could not copy the last crash logs.", error);
							showToast("Could not copy the last crash log to your clipboard.", getAssetIDByName("Warning"));
						}
					}}
					style={{
						width: "100%",
						minHeight: 40,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 6,
						backgroundColor: lastCrash ? "#292b38" : "#1c1e2b",
						opacity: lastCrash ? 1 : 0.55,
					}}
				>
					<RN.Text style={{ color: "#f2f3f5", fontFamily: "monospace", fontWeight: "600" }}>
						Copy Logs
					</RN.Text>
				</RN.TouchableOpacity>
			</RN.View>
			<TableRowGroup title="Revenge Plugins">
				{visiblePlugins.map((entry) => {
					const installed = findInstalledPlugin(entry);
					const PluginSettings = installed ? getPluginSettings(installed) : undefined;
					const isBusy = !!busy[entry.url];
					const contentWidth = Math.max(0, screenWidth - 60);
					const titleFontSize = Math.max(
						11.2,
						Math.min(17.6, contentWidth / (entry.name.length * 0.56 * fontScale)),
					);
					return (
						<RN.View
							key={entry.url}
							style={{
								marginHorizontal: 4,
								marginBottom: 12,
								padding: 16,
								borderRadius: 20,
								backgroundColor: "#2b2d31",
							}}
						>
							<RN.Text
								style={{
									alignSelf: "flex-start",
									color: "#f2f3f5",
									fontSize: titleFontSize,
									fontWeight: "600",
								}}
							>
								{entry.name}
							</RN.Text>
							<RN.View
								style={{
									flexDirection: "row",
									alignItems: "center",
									justifyContent: "space-between",
									marginTop: 12,
								}}
							>
								<RN.View
									style={{
										flexDirection: "row",
										alignItems: "center",
									}}
								>
									<IconButton
										assetNames={["WrenchIcon", "SettingsIcon", "ic_settings_24px"]}
										fallback="🔧"
										label={`Open ${entry.name} Settings`}
										disabled={!PluginSettings || fetchingAll}
										onPress={() => openPluginSettings(entry)}
									/>
									<RN.View style={{ width: 8 }} />
									<IconButton
										assetNames={["InfoIcon", "InformationIcon", "ic_info_24px"]}
										fallback="ⓘ"
										label={`Actions For ${entry.name}`}
										disabled={fetchingAll}
										onPress={() => showPluginActions(entry)}
									/>
								</RN.View>
								<RN.TouchableOpacity
									accessibilityRole="button"
									disabled={isBusy || fetchingAll}
									onPress={() => installed ? confirmDelete(entry) : void changePlugin(entry)}
									style={{
										minWidth: 88,
										height: 40,
										paddingHorizontal: 12,
										borderRadius: 12,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: installed ? "#ed4245" : "#5865f2",
										opacity: isBusy ? 0.6 : 1,
									}}
								>
									<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>
										{isBusy ? "Working..." : installed ? "Delete" : "Install"}
									</RN.Text>
								</RN.TouchableOpacity>
							</RN.View>
							<RN.Text
								style={{
									marginTop: 12,
									color: "#b5bac1",
									fontSize: 15.2,
									lineHeight: 21.85,
								}}
							>
								{entry.description}
							</RN.Text>
						</RN.View>
					);
				})}
				{visiblePlugins.length === 0 && (
					<TableRow
						label="No Plugins Found"
						subLabel="Try a different plugin name or description."
					/>
				)}
			</TableRowGroup>
		</RN.ScrollView>
	);
}
