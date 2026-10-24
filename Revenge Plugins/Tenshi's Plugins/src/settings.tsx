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
import { clearManagerActivityFailures, getManagerActivity, recordManagerActivity, type ManagerActivityMetrics, type ManagerActivityRecord, type ManagerActivityStatus } from "./activityLog";
import { clearLastCrash, getLastCrash } from "./crashLog";
import { reloadAndReturnToManager } from "./managerNavigation";
import { findInstalledPlugin, refetchInstalledPlugins, refetchPlugin, type InstalledPlugin } from "./pluginUpdater";
import { cancelScheduledAutoFetch, getAutoFetchProgress } from "./autoFetch";
import { formatAutoFetchProgress } from "./autoFetchGate";
import { getPendingManagerRestart } from "./restartState";
import { formatActivityConsoleHeader, formatLatestError, summarizeActivityConsole, type ActivityConsoleAction, type ActivityConsolePhase } from "./activityConsole";

const { TableRow, TableRowGroup, TableSwitchRow } = findByProps("TableRow", "TableRowGroup", "TableSwitchRow");
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
	const autoFetchProgress = autoFetchInProgress ? getAutoFetchProgress() : undefined;
	const autoFetchStatus = autoFetchInProgress ? formatAutoFetchProgress(autoFetchProgress) : "";
	const managerBusy = fetchingAll || autoFetchInProgress || Object.values(busy).some(Boolean);
	const pendingManagerRestart = getPendingManagerRestart();
	const installedPluginCount = catalog.filter((entry) => findInstalledPlugin(entry)).length;
	const consoleSummary = summarizeActivityConsole(activityLog, installedPluginCount, catalog.length);
	const activityMetricRows = [
		[
			{ label: "Installed", value: String(consoleSummary.installedPlugins) },
			{ label: "Repository", value: String(consoleSummary.repositoryPlugins) },
		],
		[
			{ label: "Updated", value: `${consoleSummary.updatedPlugins} / ${consoleSummary.updateTotal}` },
			{ label: "Errors", value: String(consoleSummary.errorCount) },
		],
		[{ label: "Latest error", value: formatLatestError(consoleSummary.latestErrorTimestamp) }],
	];
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
				recordActivity(`${entry.name} removed.`, "success");
				showToast(`${entry.name} was removed.`, getAssetIDByName("Check"));
			} else {
				await installPlugin(entry.url, true);
				recordActivity(`${entry.name} installed.`, "success");
				showToast(`${entry.name} was installed.`, getAssetIDByName("Check"));
			}
		} catch (error) {
			console.error(`[Tenshi's Plugins] Failed to ${installed ? "delete" : "install"} ${entry.name}.`, error);
			recordActivity(`Could not ${action.toLocaleLowerCase()} ${entry.name}.`, "failure", errorDetails(error));
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
		setActivityLog(clearManagerActivityFailures());
		setFetchingAll(true);
		setFetchProgress(0);
		setFetchTotal(0);
		setActivityStatus(formatActivityConsoleHeader(consoleState("fetch", "running")));
		recordActivity("Fetch all started.", "info");
		try {
			const result = await refetchInstalledPlugins({
				onCatalog: setCatalog,
				onProgress: (progress, total, pluginName) => {
					setFetchProgress(progress);
					setFetchTotal(total);
					setActivityStatus(formatActivityConsoleHeader(consoleState("fetch", "running", progress, total)));
				},
				onFailure: (pluginName, error) => {
					recordActivity(`Could not refresh ${pluginName}.`, "failure", errorDetails(error));
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
					`${result.updated} updated; ${result.unchanged} unchanged; ${result.available} available.`,
					metrics,
				);
				showToast(
					`${formatActivityConsoleHeader(consoleState("fetch", "complete", result.total, result.total, 0, restartRequired))} ${result.updated} updated, ${result.unchanged} unchanged, ${result.available} available.`,
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
			content: "This refreshes the plugin list and checks installed plugins for updates. New plugins will appear with an Install button but will not be installed automatically. Installed plugins may briefly stop while updating.",
			confirmText: "Fetch All",
			cancelText: "Cancel",
			onConfirm: () => { void fetchAllPlugins(); },
		});
	};

	const confirmAutoFetch = () => {
		const enable = storage.autoFetchEnabled !== true;
		showConfirmationAlert({
			title: enable ? "Enable Automatic Updates?" : "Disable Automatic Updates?",
			content: enable
				? "At startup, Tenshi's Plugins will check installed plugins for updates. It will not install plugins that are not already installed. Updated plugins may briefly stop and restart. This takes effect the next time Revenge starts."
				: "Tenshi's Plugins will stop checking for updates at startup. You can still fetch all plugins from Manage.",
			confirmText: enable ? "Enable" : "Disable",
			cancelText: "Cancel",
			onConfirm: () => {
				storage.autoFetchEnabled = enable;
				if (!enable) cancelScheduledAutoFetch();
				recordActivity(`Automatic updates ${enable ? "enabled" : "disabled"}.`, "success");
				showToast(
					enable
						? "Automatic updates will run the next time Revenge starts."
						: "Automatic updates are off.",
					getAssetIDByName("Check"),
				);
			},
		});
	};

	type BulkAction = "install" | "remove" | "clear";

	const runBulkAction = async (action: BulkAction) => {
		if (managerBusy) return;
		const actionLabel = { install: "Install All", remove: "Remove All", clear: "Clear All" }[action];
		const targets = catalog.filter((entry) => {
			const installed = findInstalledPlugin(entry);
			return action === "install" ? !installed : !!installed;
		});
		if (targets.length === 0) {
			recordActivity(`${actionLabel} skipped.`, "info", "No plugins matched this action.");
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
		const progressLabel = { install: "Installing plugins", remove: "Removing plugins", clear: "Clearing plugin data" }[action];
		setActivityStatus(`${progressLabel} (0/${targets.length})…`);
		recordActivity(`${actionLabel} started.`, "info", `${targets.length} plugin${targets.length === 1 ? "" : "s"} queued.`);
		const orderedTargets = [...targets].sort(
			(left, right) => Number(left.name === "Tenshi's Plugins") - Number(right.name === "Tenshi's Plugins"),
		);
		let completed = 0;
		const failedPlugins: string[] = [];
		const pluginAction = { install: "Installing", remove: "Removing", clear: "Clearing data for" }[action];

		try {
			for (const [index, entry] of orderedTargets.entries()) {
				setFetchProgress(index + 1);
				setActivityStatus(`${pluginAction} ${entry.name} (${index + 1}/${targets.length})…`);
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
					recordActivity(`${actionLabel} failed for ${entry.name}.`, "failure", errorDetails(error));
				}
			}
			if (action === "clear") {
				try {
					clearLastCrash();
				} catch (error) {
					console.error("[Tenshi's Plugins] Failed to clear the last crash log.", error);
					failedPlugins.push("Last crash log");
					recordActivity("Clear all failed while clearing the crash log.", "failure", errorDetails(error));
				}
			}
		} finally {
			setActivityStatus("");
			setFetchingAll(false);
		}

		const completionMessage = action === "install"
			? `${completed} plugin${completed === 1 ? "" : "s"} installed`
			: action === "remove"
				? `${completed} plugin${completed === 1 ? "" : "s"} removed`
				: `Data cleared for ${completed} plugin${completed === 1 ? "" : "s"}`;
		if (failedPlugins.length > 0) {
			recordActivity(`${actionLabel} partly completed. ${completionMessage}.`, "failure", `Failed: ${failedPlugins.join(", ")}`);
			showToast(
				`${actionLabel} partly completed. ${completionMessage}; ${failedPlugins.length} failed. See the activity log.`,
				getAssetIDByName("Warning"),
			);
		} else {
			recordActivity(`${actionLabel} complete. ${completionMessage}.`, "success");
			showToast(`${actionLabel} complete. ${completionMessage}.`, getAssetIDByName("Check"));
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
				subtitle: "Choose an action.",
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
			confirmText: "Restart",
			cancelText: "Cancel",
			onConfirm: () => {
				try {
					recordActivity("Discord restart requested.", "info");
					reloadAndReturnToManager();
				} catch (error) {
					console.error("[Tenshi's Plugins] Could not reload Revenge.", error);
					recordActivity("Discord restart failed.", "failure", errorDetails(error));
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
		const isManager = entry.name === "Tenshi's Plugins";
		const installed = findInstalledPlugin(entry);
		if (!installed && !isManager) return;

		const PluginSettings = isManager ? Settings : installed ? getPluginSettings(installed) : undefined;
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
						recordActivity(`${entry.name} data cleared.`, "success");
						showToast(`Cleared the saved data for ${entry.name}.`, getAssetIDByName("Check"));
					} catch (error) {
						console.error(`[Tenshi's Plugins] Failed to clear ${entry.name} data.`, error);
						recordActivity(`Could not clear ${entry.name}'s data.`, "failure", errorDetails(error));
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
		const isManager = entry.name === "Tenshi's Plugins";
		const PluginSettings = isManager ? Settings : installed ? getPluginSettings(installed) : undefined;

		if (PluginSettings && (installed || isManager)) {
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
					label: "Refresh",
					icon: getAssetIDByName("RetryIcon"),
					onPress: () => {
						hideActionSheet?.();
						void (async () => {
							setActivityStatus(`Refreshing ${entry.name}…`);
							recordActivity(`${entry.name} refresh started.`, "info");
							try {
								const result = await refetchPlugin(entry, installed);
								recordActivity(
									result.restartRequired
										? `${entry.name} refreshed; restart Revenge to apply the update.`
										: result.updated ? `${entry.name} refreshed.` : `${entry.name} is already up to date.`,
									"success",
								);
								showToast(
									result.restartRequired
										? `${entry.name} was updated. Restart Revenge to apply it.`
										: result.updated ? `${entry.name} was refreshed successfully.` : `${entry.name} is already up to date.`,
									getAssetIDByName("Check"),
								);
							} catch (error) {
								console.error(`[Tenshi's Plugins] Failed to refetch ${entry.name}.`, error);
								recordActivity(`${entry.name} refresh failed.`, "failure", errorDetails(error));
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
							recordActivity(`${entry.name} install URL copied.`, "success");
							showToast(`Copied the install URL for ${entry.name}.`, getAssetIDByName("Check"));
						} catch (error) {
							console.error(`[Tenshi's Plugins] Could not copy the install URL for ${entry.name}.`, error);
							recordActivity(`Could not copy ${entry.name}'s URL.`, "failure", errorDetails(error));
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
						accessibilityLabel={autoFetchEnabled ? "Turn Automatic Updates Off" : "Turn Automatic Updates On"}
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
						accessibilityLabel="Restart Revenge and Return to Tenshi's Plugins"
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
					accessibilityLabel="Search Plugins"
					placeholder="Search plugins by name or description"
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
				<RN.View style={{ marginBottom: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#3f4147" }}>
					{activityMetricRows.map((row, rowIndex) => (
						<RN.View
							key={row[0].label}
							style={{
								flexDirection: "row",
								borderBottomWidth: rowIndex < activityMetricRows.length - 1 ? 1 : 0,
								borderColor: "#3f4147",
							}}
						>
							{row.map((metric, metricIndex) => (
								<RN.View
									key={metric.label}
									style={{
										flex: 1,
										minWidth: 0,
										paddingVertical: 9,
										paddingHorizontal: 10,
										borderRightWidth: row.length === 2 && metricIndex === 0 ? 1 : 0,
										borderColor: "#3f4147",
									}}
								>
									<RN.Text style={{ color: "#b5bac1", fontSize: 11, marginBottom: 3 }}>
										{metric.label}
									</RN.Text>
									<RN.Text
										numberOfLines={1}
										ellipsizeMode="tail"
										style={{ color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}
									>
										{metric.value}
									</RN.Text>
								</RN.View>
							))}
						</RN.View>
					))}
				</RN.View>
				{pendingManagerRestart && (
					<RN.Text style={{ marginBottom: 8, color: "#f0b232", fontSize: 13, fontWeight: "600" }}>
						{`Restart Revenge to apply updates to ${pendingManagerRestart.pluginNames.join(", ")}.`}
					</RN.Text>
				)}
				<RN.View
					accessibilityRole={fetchingAll || autoFetchInProgress ? "progressbar" : undefined}
					accessibilityLabel={autoFetchInProgress
						? autoFetchProgress?.phase === "updating"
							? `Automatic update progress: ${autoFetchProgress.completed} of ${autoFetchProgress.total}${autoFetchProgress.pluginName ? `, ${autoFetchProgress.pluginName}` : ""}`
							: autoFetchStatus
						: fetchingAll ? `Plugin operation progress: ${fetchProgress} of ${fetchTotal}` : undefined}
					style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}
				>
					{(fetchingAll || autoFetchInProgress || Object.values(busy).some(Boolean)) && <RN.ActivityIndicator size="small" />}
					<RN.Text style={{ color: "#dbdee1", marginLeft: 8, flex: 1 }}>
						{activityStatus || autoFetchStatus || activityLog[0]?.summary || "No manager activity recorded."}
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
					accessibilityLabel="Copy Manager Activity Log"
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
					<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Copy Activity Log</RN.Text>
				</RN.TouchableOpacity>
				<RN.TouchableOpacity
					accessibilityLabel="Copy Latest Error Log"
					accessibilityRole="button"
					disabled={!lastCrash}
					onPress={() => {
						if (!lastCrash) return;
						try {
							clipboard.setString(lastCrash.logs);
							showToast("Copied the latest error log.", getAssetIDByName("Check"));
						} catch (error) {
							console.error("[Tenshi's Plugins] Could not copy the latest error log.", error);
							showToast("Could not copy the latest error log.", getAssetIDByName("Warning"));
						}
					}}
					style={{
						width: "100%",
						minHeight: 40,
						marginTop: 8,
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 8,
						backgroundColor: "#292b38",
						opacity: lastCrash ? 1 : 0.55,
					}}
				>
					<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>
						Copy Latest Error Log
					</RN.Text>
				</RN.TouchableOpacity>
			</RN.View>
			<TableRowGroup title="Revenge Plugins">
				{visiblePlugins.map((entry) => {
					const installed = findInstalledPlugin(entry);
					const isManager = entry.name === "Tenshi's Plugins";
					const PluginSettings = isManager ? Settings : installed ? getPluginSettings(installed) : undefined;
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
										disabled={!PluginSettings}
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
										{isBusy ? "Working…" : installed ? "Delete" : "Install"}
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
			<TableRowGroup title="Profile Button">
				<TableSwitchRow
					label="Show in Profile"
					subLabel="Add a button beside your profile controls to open Tenshi's Plugins."
					value={storage.showInProfile !== false}
					onValueChange={(value: boolean) => { storage.showInProfile = value; }}
				/>
			</TableRowGroup>
		</RN.ScrollView>
	);
}
