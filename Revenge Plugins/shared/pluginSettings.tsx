import { findByProps } from "../compat";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
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
const { TableRowGroup, TableSwitchRow } = findByProps("TableRowGroup", "TableSwitchRow");
const TableRowIcon = findByProps("TableRowIcon")?.TableRowIcon;
const settingConstants = findByProps("SETTING_RENDERER_CONFIG");
const createListModule = findByProps("createList");
const settingsOverviewScreen = findByProps("SettingsOverviewScreen");
const rootNavigationRef = findByProps("getRootNavigationRef");

function visibleShortcuts(): SettingsShortcut[] {
	return [...registry.entries.values()].filter((entry) => entry.visible);
}

function openSettingsPage(entry: SettingsShortcut) {
	if (entry.open) {
		if (!entry.open()) console.warn(`[${entry.title}] Main settings navigation is unavailable.`);
		return;
	}
	const navigation = rootNavigationRef?.getRootNavigationRef?.();
	if (typeof navigation?.navigate !== "function") {
		console.warn(`[${entry.title}] Main settings navigation is unavailable.`);
		return;
	}
	navigation.navigate("VendettaCustomPage", {
		title: entry.title,
		render: () => React.createElement(entry.page),
	});
}

function patchSettingsCategory(patches: (() => void)[]) {
	if (settingConstants) {
		const previousDescriptor = Object.getOwnPropertyDescriptor(settingConstants, "SETTING_RENDERER_CONFIG");
		let rendererConfig = settingConstants.SETTING_RENDERER_CONFIG;
		const getter = () => {
			const rows: Record<string, unknown> = {};
			for (const entry of visibleShortcuts()) {
				const icon = getAssetIDByName(entry.icon);
				rows[entry.id] = {
					type: "pressable",
					useTitle: () => entry.title,
					title: entry.title,
					icon,
					IconComponent: icon && TableRowIcon
						? () => React.createElement(TableRowIcon, { source: icon })
						: undefined,
					onPress: () => openSettingsPage(entry),
					withArrow: true,
				};
			}
			return { ...rendererConfig, ...rows };
		};
		Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
			configurable: true,
			enumerable: true,
			get: getter,
			set: (value) => { rendererConfig = value; },
		});
		patches.push(() => {
			if (Object.getOwnPropertyDescriptor(settingConstants, "SETTING_RENDERER_CONFIG")?.get !== getter) return;
			if (previousDescriptor) Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", previousDescriptor);
			else {
				delete settingConstants.SETTING_RENDERER_CONFIG;
				settingConstants.SETTING_RENDERER_CONFIG = rendererConfig;
			}
		});
	}

	const insertShortcutKeys = (sections: any[]) => {
		const revengeSection = sections.find((section) => section?.label === "Revenge" && section?.title === "Revenge");
		if (!Array.isArray(revengeSection?.settings)) return;
		const pluginIds = new Set(registry.entries.keys());
		const visibleKeys = visibleShortcuts().map((entry) => entry.id);
		revengeSection.settings = [
			...revengeSection.settings.filter((key: unknown) => typeof key !== "string" || !pluginIds.has(key)),
			...visibleKeys,
		];
	};

	if (createListModule) {
		patches.push(after("createList", createListModule, (args: any[]) => {
			const config = args[0];
			if (!config) return;
			if (Array.isArray(config.sections)) insertShortcutKeys(config.sections);
		}));
	} else if (settingsOverviewScreen) {
		patches.push(after("default", settingsOverviewScreen, (_args: unknown[], result: any) => {
			const sections = findInReactTree(result, (node: any) => Array.isArray(node?.props?.sections))?.props?.sections;
			if (Array.isArray(sections)) insertShortcutKeys(sections);
		}));
	}
}

function ensurePatches() {
	if (registry.installed) return;
	const startingPatchCount = registry.patches.length;
	try {
		patchSettingsCategory(registry.patches);
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