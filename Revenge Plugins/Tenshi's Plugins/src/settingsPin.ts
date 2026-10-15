import { findByProps } from "../../compat";
import { React } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import { navigateToManager } from "./managerNavigation";
import Settings from "./settings";

const { FormSection, FormRow } = Forms;
const settingConstants = findByProps("SETTING_RENDERER_CONFIG");
const createListModule = findByProps("createList");
const SettingsOverviewScreen = findByProps("SettingsOverviewScreen");
const TableRowIcon = findByProps("TableRowIcon")?.TableRowIcon;
let patchedOverviewTypes = new WeakSet<object>();

function patchMainSettingsPanel(unpatches: (() => void)[]) {
	const overviewModule = findByProps("renderTitle", "sections");
	if (!overviewModule) return;

	unpatches.push(
		after("default", overviewModule, (_args, result) => {
			const overview = findInReactTree(
				result?.props?.children,
				(node: any) => node?.type?.name === "UserSettingsOverview",
			);
			const overviewType = overview?.type;
			if (!overviewType?.prototype || patchedOverviewTypes.has(overviewType)) return;
			patchedOverviewTypes.add(overviewType);

			const panelUnpatch = after("render", overviewType.prototype, (_renderArgs, rendered) => {
				const sections = findInReactTree(
					rendered?.props?.children,
					(node: any) => node?.children?.[1]?.type === FormSection,
				)?.children;
				if (!Array.isArray(sections) || sections.some((section: any) => section?.key === "tenshi-plugins-main-settings")) return;

				const row = React.createElement(FormRow, {
					key: "tenshi-plugins-main-settings",
					label: "Tenshi's Plugins",
					leading: React.createElement(FormRow.Icon, { source: getAssetIDByName("ChatCheckIcon") }),
					trailing: React.createElement(FormRow.Arrow),
					onPress: () => {
						if (!navigateToManager(Settings)) console.warn("[Tenshi's Plugins] Main settings navigation is unavailable.");
					},
				});
				sections.push(row);
			});
			unpatches.push(() => {
				panelUnpatch();
				patchedOverviewTypes.delete(overviewType);
			});
		}, true),
	);
}

function patchSettingsCategory(unpatches: (() => void)[]) {
	if (!settingConstants) return;

	const key = "tenshiPlugins";
	const rowDefinition = {
		[key]: {
			type: "pressable",
			useTitle: () => "Tenshi's Plugins",
			title: "Tenshi's Plugins",
			icon: getAssetIDByName("ChatCheckIcon"),
			IconComponent: TableRowIcon
				? () => React.createElement(TableRowIcon, { source: getAssetIDByName("ChatCheckIcon") })
				: undefined,
			onPress: () => {
				if (!navigateToManager(Settings)) console.warn("[Tenshi's Plugins] Main settings navigation is unavailable.");
			},
			withArrow: true,
		},
	};

	const previousDescriptor = Object.getOwnPropertyDescriptor(settingConstants, "SETTING_RENDERER_CONFIG");
	let rendererConfig = settingConstants.SETTING_RENDERER_CONFIG;
	Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", {
		enumerable: true,
		configurable: true,
		get: () => ({ ...rendererConfig, ...rowDefinition }),
		set: (value) => { rendererConfig = value; },
	});
	unpatches.push(() => {
		if (previousDescriptor) Object.defineProperty(settingConstants, "SETTING_RENDERER_CONFIG", previousDescriptor);
		else {
			delete settingConstants.SETTING_RENDERER_CONFIG;
			settingConstants.SETTING_RENDERER_CONFIG = rendererConfig;
		}
	});

	const firstRender = Symbol("tenshiPluginsSettingsPin");
	if (createListModule) {
		unpatches.push(
			after("createList", createListModule, (args) => {
				const config = args[0];
				if (!config || config[firstRender]) return;
				config[firstRender] = true;
				const revengeSection = config.sections?.find((section: any) =>
					section?.label === "Revenge" && section?.title === "Revenge",
				);
				if (Array.isArray(revengeSection?.settings) && !revengeSection.settings.includes(key)) {
					revengeSection.settings = [...revengeSection.settings, key];
				}
			}),
		);
	} else if (SettingsOverviewScreen) {
		unpatches.push(
			after("default", SettingsOverviewScreen, (_args, result) => {
				const sections = findInReactTree(result, (node: any) => Array.isArray(node?.props?.sections))?.props?.sections;
				const revengeSection = sections?.find((section: any) =>
					section?.label === "Revenge" && section?.title === "Revenge",
				);
				if (Array.isArray(revengeSection?.settings) && !revengeSection.settings.includes(key)) {
					revengeSection.settings = [...revengeSection.settings, key];
				}
			}),
		);
	}
}

export function installSettingsPin(): () => void {
	const unpatches: (() => void)[] = [];
	try {
		patchSettingsCategory(unpatches);
		patchMainSettingsPanel(unpatches);
		if (unpatches.length === 0) {
			console.warn("[Tenshi's Plugins] Could not find a supported main settings integration point.");
		}
	} catch (error) {
		console.error("[Tenshi's Plugins] Failed to add the main settings shortcut.", error);
	}

	return () => {
		for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	};
}
