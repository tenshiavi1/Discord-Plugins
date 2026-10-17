import { findByProps } from "../compat";
import { NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";

type SettingsShortcut = {
	id: string;
	title: string;
	icon: string;
	page: () => unknown;
	visible: boolean;
	open?: () => boolean;
};

type ShortcutRegistry = {
	entries: Map<string, SettingsShortcut>;
	patches: (() => void)[];
	installed: boolean;
};

const REGISTRY_KEY = "__revengePluginSettingsShortcutRegistry";
const SHORTCUT_KEY_PREFIX = "revenge-plugin-settings-";
const globalState = globalThis as typeof globalThis & { [REGISTRY_KEY]?: ShortcutRegistry };
const registry = globalState[REGISTRY_KEY] ??= { entries: new Map(), patches: [], installed: false };
const { FormSection, FormRow } = Forms;
const { TableRowGroup, TableSwitchRow } = findByProps("TableRowGroup", "TableSwitchRow");
const settingsOverviewScreen = findByProps("SettingsOverviewScreen");
const settingsOverviewModule = findByProps("renderTitle", "sections");

function visibleShortcuts(): SettingsShortcut[] {
	return [...registry.entries.values()].filter((entry) => entry.visible);
}

function MainSettingsRow({ entry }: { entry: SettingsShortcut }) {
	const navigation = NavigationNative.useNavigation();
	const icon = getAssetIDByName(entry.icon);
	return React.createElement(FormRow, {
		label: entry.title,
		leading: icon ? React.createElement(FormRow.Icon, { source: icon }) : undefined,
		trailing: React.createElement(FormRow.Arrow),
		onPress: () => {
			if (entry.open) {
				if (!entry.open()) console.warn(`[${entry.title}] Main settings navigation is unavailable.`);
				return;
			}
			if (typeof navigation?.navigate !== "function") {
				console.warn(`[${entry.title}] Main settings navigation is unavailable.`);
				return;
			}
			navigation.navigate("VendettaCustomPage", {
				title: entry.title,
				render: () => React.createElement(entry.page),
			});
		},
	});
}

function patchMainSettingsPanel(patches: (() => void)[]) {
	if (!FormSection || !FormRow) return;
	const overviewModule = settingsOverviewModule;
	if (overviewModule) {
		const patchedOverviewTypes = new WeakSet<object>();
		patches.push(after("default", overviewModule, (_args: unknown[], result: any) => {
			const overview = findInReactTree(result?.props?.children, (node: any) => node?.type?.name === "UserSettingsOverview");
			const overviewType = overview?.type;
			if (!overviewType?.prototype || patchedOverviewTypes.has(overviewType)) return;
			patchedOverviewTypes.add(overviewType);
			const unpatchRender = after("render", overviewType.prototype, (_renderArgs: unknown[], rendered: any) => {
				const sections = findInReactTree(
					rendered?.props?.children,
					(node: any) => node?.children?.[1]?.type === FormSection,
				)?.children;
				if (!Array.isArray(sections)) return;

				const visible = visibleShortcuts();
				const visibleKeys = new Set(visible.map((entry) => `${SHORTCUT_KEY_PREFIX}${entry.id}`));
				for (let index = sections.length - 1; index >= 0; index--) {
					const key = sections[index]?.key;
					if (typeof key === "string" && key.startsWith(SHORTCUT_KEY_PREFIX) && !visibleKeys.has(key)) sections.splice(index, 1);
				}
				const existingKeys = new Set(sections.map((section: any) => section?.key));
				for (const entry of visible) {
					const key = `${SHORTCUT_KEY_PREFIX}${entry.id}`;
					if (!existingKeys.has(key)) sections.push(React.createElement(MainSettingsRow, { key, entry }));
				}
			});
			patches.push(() => {
				unpatchRender();
				patchedOverviewTypes.delete(overviewType);
			});
		}, true));
		return;
	}

	if (settingsOverviewScreen) {
		patches.push(after("default", settingsOverviewScreen, (_args: unknown[], result: any) => {
			const sections = findInReactTree(result, (node: any) => Array.isArray(node?.props?.sections))?.props?.sections;
			if (!Array.isArray(sections)) return;
			const visible = visibleShortcuts();
			const visibleKeys = new Set(visible.map((entry) => `${SHORTCUT_KEY_PREFIX}${entry.id}`));
			for (let index = sections.length - 1; index >= 0; index--) {
				const key = sections[index]?.key;
				if (typeof key === "string" && key.startsWith(SHORTCUT_KEY_PREFIX) && !visibleKeys.has(key)) sections.splice(index, 1);
			}
			const existingKeys = new Set(sections.map((section: any) => section?.key));
			for (const entry of visible) {
				const key = `${SHORTCUT_KEY_PREFIX}${entry.id}`;
				if (!existingKeys.has(key)) sections.push(React.createElement(MainSettingsRow, { key, entry }));
			}
		}));
	}
}

function ensurePatches() {
	if (registry.installed) return;
	const startingPatchCount = registry.patches.length;
	try {
		patchMainSettingsPanel(registry.patches);
		registry.installed = registry.patches.length > startingPatchCount;
		if (!registry.installed) {
			console.warn("[Revenge Plugins] Could not find a supported main settings integration point.");
		}
	} catch (error) {
		console.error("[Revenge Plugins] Failed to register plugin settings shortcuts.", error);
	}
}

function removePatches() {
	for (const unpatch of registry.patches.splice(0).reverse()) {
		try {
			unpatch();
		} catch (error) {
			console.error("[Revenge Plugins] Could not remove a plugin settings shortcut patch.", error);
		}
	}
	registry.installed = false;
}

export function registerPluginSettingsShortcut(shortcut: SettingsShortcut): () => void {
	registry.entries.set(shortcut.id, shortcut);
	ensurePatches();
	return () => {
		if (registry.entries.get(shortcut.id) !== shortcut) return;
		registry.entries.delete(shortcut.id);
		if (registry.entries.size === 0) removePatches();
	};
}

export function setPluginSettingsShortcutVisible(id: string, visible: boolean) {
	const shortcut = registry.entries.get(id);
	if (shortcut) shortcut.visible = visible;
}

export function PluginSettingsToggle({ id }: { id: string }) {
	useProxy(storage);
	return (
		<TableSwitchRow
			label="Show in Settings"
			subLabel="Add a shortcut to this plugin in Discord's main Settings screen."
			value={storage.showInSettings === true}
			onValueChange={(value: boolean) => {
				storage.showInSettings = value;
				setPluginSettingsShortcutVisible(id, value);
			}}
		/>
	);
}

export function PluginSettingsSection({ id }: { id: string }) {
	return (
		<RN.View style={{ marginTop: 12 }}>
			<RN.View style={{ height: 1, marginHorizontal: 10, marginBottom: 8, backgroundColor: "#3f4147" }} />
			<TableRowGroup title="Plugin Settings">
				<PluginSettingsToggle id={id} />
			</TableRowGroup>
		</RN.View>
	);
}