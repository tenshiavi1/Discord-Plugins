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
import { MANAGED_PLUGINS, type ManagedPlugin } from "./catalog";
import { getManagerActivity, recordManagerActivity, type ManagerActivityMetrics, type ManagerActivityRecord, type ManagerActivityStatus } from "./activityLog";
import { clearLastCrash, getCrashReasons, getLastCrash } from "./crashLog";
import { reloadAndReturnToManager } from "./managerNavigation";
import { findInstalledPlugin, refetchInstalledPlugins, refetchPlugin, type InstalledPlugin } from "./pluginUpdater";
import { cancelScheduledAutoFetch } from "./autoFetch";
import { getPendingManagerRestart } from "./restartState";
import { formatActivityConsoleHeader, formatLatestError, summarizeActivityConsole, type ActivityConsoleAction, type ActivityConsolePhase } from "./activityConsole";

const { TableRow, TableRowGroup } = findByProps("TableRow", "TableRowGroup");
const showSimpleActionSheet = findByProps("showSimpleActionSheet")?.showSimpleActionSheet;
const hideActionSheet = findByProps("openLazy", "hideActionSheet")?.hideActionSheet;

function errorDetails(error: unknown): string {
	if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
	return String(error);
}

function findStackNavigation(navigation: any) {
	let current = navigation;
	while (current) {
		if (typeof current.push === "function") return current;
		current = current.getParent?.();
	}
	return undefined;
}

function getPluginSettings(installed: InstalledPlugin) {
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
	React.useEffect(() => {
		setActivityLog(getManagerActivity());
	}, [storage.managerActivity]);
	const navigation = NavigationNative.useNavigation();
	const { width: screenWidth, fontScale } = RN.useWindowDimensions();
	const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
	const autoFetchEnabled = storage.autoFetchEnabled === true;
	const autoFetchInProgress = storage.autoFetchInProgress === true;
	const managerBusy = fetchingAll || autoFetchInProgress || Object.values(busy).some(Boolean);
	const pendingManagerRestart = getPendingManagerRestart();
	const installedPluginCount = catalog.filter((entry) => findInstalledPlugin(entry)).length;
	const consoleSummary = summarizeActivityConsole(activityLog, installedPluginCount, catalog.length);
	const consoleState = (
		action: ActivityConsoleAction,
		phase: ActivityConsolePhase,
		current = 0,
		total = 0,
		errors = 0,
		restartRequired = Boolean(pendingManagerRestart),
	) => ({
		action,
		phase,
		current,
		total,
		errors,
		installedCount: installedPluginCount,
		repositoryCount: catalog.length,
		updatedCount: consoleSummary.updatedPlugins,
		updatedTotal: consoleSummary.updateTotal,
		restartRequired,
	});
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

	const recordActivity = (summary: string, status: ManagerActivityStatus, details?: string, metrics?: ManagerActivityMetrics) => {
		setActivityLog(recordManagerActivity(summary, status, details, metrics));
	};

	const formatActivityLog = (maxLines: number) => activityLog
		.flatMap((record: ManagerActivityRecord) => {
			const timestamp = new Date(record.timestamp).toISOString();
			return [
				`[${timestamp}] ${record.status.toUpperCase()}: ${record.summary}`,
				...(record.details ? record.details.split(/\r?\n/) : []),
			];
		})
		.slice(0, maxLines)
		.join("\n");

	const changePlugin = async (entry: ManagedPlugin) => {
		if (managerBusy || busy[entry.url]) return;
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
		if (managerBusy) return;
		setFetchingAll(true);
		setFetchProgress(0);
		setFetchTotal(0);
		setActivityStatus(formatActivityConsoleHeader(consoleState("fetch", "running")));
		recordActivity("Fetch All started", "info");
		try {
			const result = await refetchInstalledPlugins({
				onCatalog: setCatalog,
				onProgress: (progress, total, pluginName) => {
					setFetchProgress(progress);
					setFetchTotal(total);
					setActivityStatus(formatActivityConsoleHeader(consoleState("fetch", "running", progress, total)));
				},
				onFailure: (pluginName, error) => {
					recordActivity(`${pluginName} fetch failed`, "failure", errorDetails(error));
				},
			});
			setFetchProgress(result.total);
			const restartRequired = result.restartRequired.length > 0;
			const metrics: ManagerActivityMetrics = {
				installedPlugins: result.total - result.available,
				repositoryPlugins: result.total,
				updatedPlugins: result.updated,
				updateTotal: result.total - result.available,
			};

			if (result.failures.length > 0) {
				recordActivity(
					formatActivityConsoleHeader(consoleState("fetch", "failed", result.total, result.total, result.failures.length, restartRequired)),
					"failure",
					result.failures.join("\n"),
					metrics,
				);
				showToast(
					formatActivityConsoleHeader(consoleState("fetch", "failed", result.total, result.total, result.failures.length, restartRequired)),
					getAssetIDByName("Warning"),
				);
			} else {
				recordActivity(
					formatActivityConsoleHeader(consoleState("fetch", "complete", result.total, result.total, 0, restartRequired)),
					"success",
					`Updated ${result.updated}; unchanged ${result.unchanged}; available ${result.available}.`,
					metrics,
				);
				showToast(
					`${formatActivityConsoleHeader(consoleState("fetch", "complete", result.total, result.total, 0, restartRequired))} Updated ${result.updated}; unchanged ${result.unchanged}; available ${result.available}.`,
					getAssetIDByName("Check"),
				);
			}
		} catch (error) {
			console.error("[Tenshi's Plugins] Failed to fetch the plugin catalog.", error);
			recordActivity(formatActivityConsoleHeader(consoleState("fetch", "failed", 0, 0, 1)), "failure", errorDetails(error));
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

	const confirmAutoFetch = () => {
		const enable = storage.autoFetchEnabled !== true;
		showConfirmationAlert({
			title: enable ? "Enable automatic refetch?" : "Turn off automatic refetch?",
			content: enable
				? "On each Revenge startup or restart, Tenshi's Plugins will check for updates to installed plugins. It will not install uninstalled plugins. Updated plugins may briefly stop and restart. This takes effect on the next startup."
				: "Tenshi's Plugins will stop refetching installed plugins at startup. You can still use Manage > Fetch All at any time.",
			confirmText: enable ? "Auto On" : "Auto Off",
			cancelText: "Cancel",
			onConfirm: () => {
				storage.autoFetchEnabled = enable;
			if (!enable) cancelScheduledAutoFetch();
				recordActivity(`Automatic plugin refetch ${enable ? "enabled" : "disabled"}`, "success");
				showToast(
					enable
						? "Automatic plugin refetch is on for the next Revenge startup."
						: "Automatic plugin refetch is off.",
					getAssetIDByName("Check"),
				);
			},
		});
	};

	type BulkAction = "install" | "remove" | "clear";

	const runBulkAction = async (action: BulkAction) => {
		if (managerBusy) return;
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
				title: "Manage plugins",
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
		if (managerBusy) return;
		showConfirmationAlert({
			title: "Restart Revenge?",
			content: "Revenge will restart.",
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
		if (managerBusy) return;
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
								const result = await refetchPlugin(entry, installed);
								recordActivity(
									result.restartRequired
										? `${entry.name} refetched; restart Revenge to load the update`
										: result.updated ? `${entry.name} refetched` : `${entry.name} is already up to date`,
									"success",
								);
								showToast(
									result.restartRequired
										? `${entry.name} was updated. Restart Revenge to load it.`
										: result.updated ? `${entry.name} was refreshed successfully.` : `${entry.name} is already up to date.`,
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
						accessibilityLabel="Manage plugins"
						accessibilityRole="button"
						disabled={managerBusy}
						onPress={showManageActions}
						style={{
							minHeight: 40,
							paddingHorizontal: 12,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: "#5865f2",
								opacity: managerBusy ? 0.6 : 1,
						}}
					>
						<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>Manage</RN.Text>
					</RN.TouchableOpacity>
					<RN.View style={{ width: 8 }} />
					<RN.TouchableOpacity
						accessibilityLabel={autoFetchEnabled ? "Turn automatic plugin refetch off" : "Turn automatic plugin refetch on"}
						accessibilityRole="button"
						disabled={fetchingAll || Object.values(busy).some(Boolean)}
						onPress={confirmAutoFetch}
						style={{
							minHeight: 40,
							minWidth: 68,
							paddingHorizontal: 10,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: autoFetchEnabled ? "#ed4245" : "#3ba55c",
							opacity: fetchingAll || Object.values(busy).some(Boolean) ? 0.6 : 1,
						}}
					>
						<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>
							{autoFetchEnabled ? "Auto Off" : "Auto On"}
						</RN.Text>
					</RN.TouchableOpacity>
					<RN.View style={{ width: 8 }} />
					<RN.TouchableOpacity
						accessibilityLabel="Restart Revenge and return to Tenshi's Plugins"
						accessibilityRole="button"
						disabled={managerBusy}
						onPress={confirmRestart}
						style={{
							minHeight: 40,
							paddingHorizontal: 12,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: "#ed4245",
							opacity: managerBusy ? 0.6 : 1,
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
					placeholder="Search plugins by name or description"
					value={searchQuery}
					onChangeText={setSearchQuery}
					resetKey={searchInputReset}
					returnKeyType="search"
					style={{ flex: 1, minHeight: 44, color: "#f2f3f5" }}
				/>
				{searchQuery.length > 0 && (
					<RN.TouchableOpacity
						accessibilityLabel="Clear plugin search"
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
				{pendingManagerRestart && (
					<RN.Text style={{ marginBottom: 8, color: "#f0b232", fontSize: 13, fontWeight: "600" }}>
						{`Restart Revenge to load updates for ${pendingManagerRestart.pluginNames.join(", ")}.`}
					</RN.Text>
				)}
				<RN.View
					accessibilityRole={fetchingAll || autoFetchInProgress ? "progressbar" : undefined}
					accessibilityLabel={autoFetchInProgress
						? "Automatically updating installed plugins"
						: fetchingAll ? `Plugin operation progress: ${fetchProgress} of ${fetchTotal}` : undefined}
					style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
				>
					{(fetchingAll || autoFetchInProgress || Object.values(busy).some(Boolean)) && <RN.ActivityIndicator size="small" />}
					<RN.Text style={{ color: "#dbdee1", marginLeft: 8, flex: 1 }}>
						{activityStatus || activityLog[0]?.summary || "No manager activity recorded."}
						{fetchingAll && fetchTotal > 0 ? ` (${fetchProgress}/${fetchTotal})` : ""}
					</RN.Text>
				</RN.View>
				{activityLog.length > 0 && (
					<RN.Text
						selectable
						numberOfLines={3}
						style={{ color: "#b5bac1", fontSize: 11, fontFamily: "monospace" }}
					>
						{formatActivityLog(3)}
					</RN.Text>
				)}
				<RN.TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel="Copy manager activity log"
					disabled={activityLog.length === 0}
					onPress={() => {
						try {
							clipboard.setString(formatActivityLog(10));
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
						<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Copy activity log</RN.Text>
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
						? `Last saved error log: ${lastCrash.pluginName} ${crashDate}`
						: "Last saved error log: None recorded"}
				</RN.Text>
				{lastCrash?.message
					? <RN.Text numberOfLines={2} ellipsizeMode="tail" style={{ marginTop: 4, color: "#d8dee9", fontFamily: "monospace", fontSize: 13 }}>
						{`${lastCrash.errorName ?? "Error"}: ${lastCrash.message.slice(0, 180)}`}
					</RN.Text>
					: null}
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
						? `Recent fatal errors: ${crashReasons
							.map((reason) => `${reason.pluginName} (${formatCrashDate(reason.timestamp)})`)
							.join(", ")}`
						: "Recent fatal errors: None recorded"}
				</RN.Text>
				<RN.TouchableOpacity
					accessibilityLabel="Copy saved error log"
					accessibilityRole="button"
					disabled={!lastCrash}
					onPress={() => {
						if (!lastCrash) return;
						try {
							clipboard.setString(lastCrash.logs);
							showToast("Copied the crash log to your clipboard.", getAssetIDByName("Check"));
						} catch (error) {
							console.error("[Tenshi's Plugins] Could not copy the last crash logs.", error);
							showToast("Could not copy the crash log to your clipboard.", getAssetIDByName("Warning"));
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
						Copy saved error log
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
										label={`Open ${entry.name} settings`}
										disabled={!PluginSettings || managerBusy}
										onPress={() => openPluginSettings(entry)}
									/>
									<RN.View style={{ width: 8 }} />
									<IconButton
										assetNames={["InfoIcon", "InformationIcon", "ic_info_24px"]}
										fallback="ⓘ"
										label={`Actions for ${entry.name}`}
										disabled={managerBusy}
										onPress={() => showPluginActions(entry)}
									/>
								</RN.View>
								<RN.TouchableOpacity
									accessibilityRole="button"
									disabled={isBusy || managerBusy}
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
						label="No plugins found"
						subLabel="Try a different plugin name or description."
					/>
				)}
			</TableRowGroup>
		</RN.ScrollView>
	);
}
