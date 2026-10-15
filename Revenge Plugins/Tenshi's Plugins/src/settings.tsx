import { findByProps } from "@vendetta/metro";
import { clipboard, NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { fetchPlugin, getSettings, installPlugin, plugins, removePlugin, startPlugin, stopPlugin } from "@vendetta/plugins";
import { createMMKVBackend } from "@vendetta/storage";
import { useProxy } from "@vendetta/storage";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { MANAGED_PLUGINS, type ManagedPlugin } from "./catalog";
import { reloadAndReturnToManager } from "./managerNavigation";

const { FormRow, FormSection } = Forms;
const showSimpleActionSheet = findByProps("showSimpleActionSheet")?.showSimpleActionSheet;
const hideActionSheet = findByProps("openLazy", "hideActionSheet")?.hideActionSheet;

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
	return undefined;
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
	const [busy, setBusy] = React.useState<Record<string, boolean>>({});
	const [fetchingAll, setFetchingAll] = React.useState(false);
	const [fetchProgress, setFetchProgress] = React.useState(0);
	const [searchQuery, setSearchQuery] = React.useState("");
	const navigation = NavigationNative.useNavigation();
	const { width: screenWidth, fontScale } = RN.useWindowDimensions();
	const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
	const visiblePlugins = MANAGED_PLUGINS
		.filter((entry) =>
			!normalizedQuery ||
			entry.name.toLocaleLowerCase().includes(normalizedQuery) ||
			entry.description.toLocaleLowerCase().includes(normalizedQuery),
		)
		.sort((left, right) => left.name.localeCompare(right.name));

	const changePlugin = async (entry: ManagedPlugin) => {
		if (busy[entry.url]) return;
		setBusy((current) => ({ ...current, [entry.url]: true }));
		const installed = findInstalledPlugin(entry);

		try {
			if (installed) {
				await removePlugin(installed.key);
				showToast(`${entry.name} deleted`, getAssetIDByName("Check"));
			} else {
				await installPlugin(entry.url, true);
				showToast(`${entry.name} installed`, getAssetIDByName("Check"));
			}
		} catch (error) {
			console.error(`[Tenshi's Plugins] Failed to ${installed ? "delete" : "install"} ${entry.name}.`, error);
			showToast(`Failed to ${installed ? "delete" : "install"} ${entry.name}`, getAssetIDByName("Warning"));
		} finally {
			setBusy((current) => ({ ...current, [entry.url]: false }));
		}
	};

	const refetchPlugin = async (
		entry: ManagedPlugin,
		installed: NonNullable<ReturnType<typeof findInstalledPlugin>>,
	) => {
		let stopped = false;
		try {
			if (installed.instance.enabled) {
				stopPlugin(installed.key, false);
				stopped = true;
			}
			await fetchPlugin(installed.key);
			if (stopped) {
				await startPlugin(installed.key);
				stopped = false;
			}
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

	const fetchAllPlugins = async () => {
		if (fetchingAll || Object.values(busy).some(Boolean)) return;
		setFetchingAll(true);
		setFetchProgress(0);
		const orderedPlugins = [...MANAGED_PLUGINS].sort(
			(left, right) => Number(left.name === "Tenshi's Plugins") - Number(right.name === "Tenshi's Plugins"),
		);
		const failedPlugins: string[] = [];
		let fetchedCount = 0;

		try {
			for (const [index, entry] of orderedPlugins.entries()) {
				setFetchProgress(index + 1);
				try {
					const installed = findInstalledPlugin(entry);
					if (installed) {
						await refetchPlugin(entry, installed);
					} else {
						await installPlugin(entry.url, true);
					}
					fetchedCount += 1;
				} catch (error) {
					console.error(`[Tenshi's Plugins] Fetch All failed for ${entry.name}.`, error);
					failedPlugins.push(entry.name);
				}
			}
		} finally {
			setFetchingAll(false);
		}

		if (failedPlugins.length > 0) {
			showToast(
				`Fetched ${fetchedCount}/${orderedPlugins.length}; failed: ${failedPlugins.join(", ")}`,
				getAssetIDByName("Warning"),
			);
		} else {
			showToast(`Fetched all ${fetchedCount} plugins`, getAssetIDByName("Check"));
		}
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

		const pluginId = installed.instance?.id ?? installed.key;
		const PluginSettings = getSettings(pluginId);
		if (!PluginSettings) {
			showToast(`${entry.name} has no settings page`, getAssetIDByName("Warning"));
			return;
		}
		const stackNavigation = findStackNavigation(navigation);
		if (!stackNavigation) {
			console.error("[Tenshi's Plugins] Stack navigation is unavailable for plugin settings.");
			showToast("Plugin settings navigation is unavailable", getAssetIDByName("Warning"));
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
						showToast(`${entry.name} data cleared`, getAssetIDByName("Check"));
					} catch (error) {
						console.error(`[Tenshi's Plugins] Failed to clear ${entry.name} data.`, error);
						if (stopped) {
							try {
								await startPlugin(installed.key);
							} catch (restartError) {
								console.error(`[Tenshi's Plugins] Failed to restart ${entry.name} after clearing data.`, restartError);
							}
						}
						showToast(`Failed to clear ${entry.name} data`, getAssetIDByName("Warning"));
					}
				})();
			},
		});
	};

	const showPluginActions = (entry: ManagedPlugin) => {
		const installed = findInstalledPlugin(entry);
		if (!showSimpleActionSheet) {
			console.error("[Tenshi's Plugins] Revenge's plugin action sheet is unavailable.");
			showToast("Plugin actions are unavailable", getAssetIDByName("Warning"));
			return;
		}

		const options = [];
		const PluginSettings = installed ? getSettings(installed.key) : undefined;

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
							try {
								await refetchPlugin(entry, installed);
								showToast(`${entry.name} refetched`, getAssetIDByName("Check"));
							} catch (error) {
								console.error(`[Tenshi's Plugins] Failed to refetch ${entry.name}.`, error);
								showToast(`Failed to refetch ${entry.name}`, getAssetIDByName("Warning"));
							}
						})();
					},
				},
				{
					label: "Copy URL",
					icon: getAssetIDByName("LinkIcon"),
					onPress: () => {
						clipboard.setString(installed.key);
						showToast("Plugin URL copied", getAssetIDByName("Check"));
					},
				},
				{
					label: installed.instance.update === false ? "Enable Updates" : "Disable Updates",
					icon: getAssetIDByName("DownloadIcon"),
					onPress: () => {
						installed.instance.update = installed.instance.update === false;
						showToast(
							`${entry.name} updates ${installed.instance.update ? "enabled" : "disabled"}`,
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
				}}
			>
				<RN.Text style={{ color: "#f2f3f5", fontSize: 20, fontWeight: "700" }}>
					Tenshi's Plugins
				</RN.Text>
				<RN.View style={{ flexDirection: "row", alignItems: "center" }}>
					<RN.TouchableOpacity
						accessibilityLabel="Fetch All Plugins"
						accessibilityRole="button"
						disabled={fetchingAll || Object.values(busy).some(Boolean)}
						onPress={() => { void fetchAllPlugins(); }}
						style={{
							minHeight: 40,
							paddingHorizontal: 12,
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 12,
							backgroundColor: "#248046",
							opacity: fetchingAll || Object.values(busy).some(Boolean) ? 0.6 : 1,
						}}
					>
						<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>
							{fetchingAll ? `Fetching ${fetchProgress}/${MANAGED_PLUGINS.length}` : "Fetch All"}
						</RN.Text>
					</RN.TouchableOpacity>
					<RN.View style={{ width: 8 }} />
					<RN.TouchableOpacity
						accessibilityLabel="Restart Revenge and return to Tenshi's Plugins"
						accessibilityRole="button"
						disabled={fetchingAll}
						onPress={() => {
							try {
								reloadAndReturnToManager();
							} catch (error) {
								console.error("[Tenshi's Plugins] Could not reload Revenge.", error);
								showToast("Could not reload Revenge", getAssetIDByName("Warning"));
							}
						}}
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
					borderRadius: 8,
					backgroundColor: "#1e1f22",
				}}
			>
				<RN.TextInput
					accessibilityLabel="Search plugins"
					placeholder="Search Plugins by Name or Description"
					placeholderTextColor="#949ba4"
					value={searchQuery}
					onChangeText={setSearchQuery}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="search"
					style={{ flex: 1, minHeight: 44, color: "#f2f3f5" }}
				/>
				{searchQuery.length > 0 && (
					<RN.TouchableOpacity
						accessibilityLabel="Clear Plugin Search"
						accessibilityRole="button"
						onPress={() => setSearchQuery("")}
						style={{ padding: 8 }}
					>
						<RN.Text style={{ color: "#b5bac1", fontSize: 16 }}>Clear</RN.Text>
					</RN.TouchableOpacity>
				)}
			</RN.View>
			<FormSection title="Revenge Plugins">
				{visiblePlugins.map((entry) => {
					const installed = findInstalledPlugin(entry);
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
								backgroundColor: "#1c1e2b",
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
										disabled={!installed || fetchingAll}
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
					<FormRow
						label="No Plugins Found"
						subLabel="Try a different plugin name or description."
					/>
				)}
			</FormSection>
		</RN.ScrollView>
	);
}
