import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { getSettings, installPlugin, plugins, removePlugin } from "@vendetta/plugins";
import { useProxy } from "@vendetta/storage";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { MANAGED_PLUGINS, type ManagedPlugin } from "./catalog";

const { FormRow, FormSection } = Forms;
const tabsNavigationRef = findByProps("getRootNavigationRef");

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
				opacity: disabled ? 0.4 : 1,
			}}
		>
			{icon
				? <RN.Image source={icon} style={{ width: 20, height: 20 }} />
				: <RN.Text style={{ fontSize: 20 }}>{fallback}</RN.Text>}
		</RN.TouchableOpacity>
	);
}

export default function Settings() {
	useProxy(plugins);
	const [busy, setBusy] = React.useState<Record<string, boolean>>({});
	const [searchQuery, setSearchQuery] = React.useState("");
	const navigation = tabsNavigationRef?.getRootNavigationRef?.();
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
		if (!navigation) {
			console.warn("[Tenshi's Plugins] Plugin settings navigation is unavailable.");
			showToast("Settings navigation is unavailable", getAssetIDByName("Warning"));
			return;
		}

		navigation.navigate("VendettaCustomPage", {
			title: entry.name,
			render: () => React.createElement(PluginSettings),
		});
	};

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
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
					placeholder="Search plugins by name or description"
					value={searchQuery}
					onChangeText={setSearchQuery}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="search"
					style={{ flex: 1, minHeight: 44, color: "#f2f3f5" }}
				/>
				{searchQuery.length > 0 && (
					<RN.TouchableOpacity
						accessibilityLabel="Clear plugin search"
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
					return (
						<FormRow
							key={entry.url}
							label={entry.name}
							subLabel={entry.description}
							trailing={
								<RN.View style={{ flexDirection: "row", alignItems: "center" }}>
									<IconButton
										assetNames={["WrenchIcon", "SettingsIcon", "ic_settings_24px"]}
										fallback="🔧"
										label={`Open ${entry.name} settings`}
										disabled={!installed}
										onPress={() => openPluginSettings(entry)}
									/>
									<IconButton
										assetNames={["InfoIcon", "InformationIcon", "ic_info_24px"]}
										fallback="ⓘ"
										label={`Information about ${entry.name}`}
										onPress={() => showConfirmationAlert({
											title: entry.name,
											content: entry.description,
											confirmText: "Close",
											onConfirm: () => {},
										})}
									/>
									<RN.TouchableOpacity
										accessibilityRole="button"
										disabled={isBusy}
										onPress={() => installed ? confirmDelete(entry) : void changePlugin(entry)}
										style={{
											minWidth: 76,
											paddingHorizontal: 10,
											paddingVertical: 8,
											borderRadius: 8,
											alignItems: "center",
											backgroundColor: installed ? "#ed4245" : "#5865f2",
											opacity: isBusy ? 0.6 : 1,
										}}
									>
										<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>
											{isBusy ? "Working..." : installed ? "Delete" : "Install"}
										</RN.Text>
									</RN.TouchableOpacity>
								</RN.View>
							}
						/>
					);
				})}
				{visiblePlugins.length === 0 && (
					<FormRow
						label="No plugins found"
						subLabel="Try a different plugin name or description."
					/>
				)}
			</FormSection>
		</RN.ScrollView>
	);
}
