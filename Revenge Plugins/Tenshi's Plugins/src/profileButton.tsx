import { instead } from "@vendetta/patcher";
import { NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { find } from "../../compat";
import Settings from "./settings";
import { navigateToManager } from "./managerNavigation";

const YOU_BAR_BUTTON_MODULE = 16334;
const YOU_BAR_BUTTONS_MODULE = 16335;
const SETTINGS_ICON_MODULE = 6883;
const YOU_BAR_CONSTANTS_MODULE = 14899;
const ModuleRequire = globalThis as typeof globalThis & { __r?: (id: number) => any };
let unpatch: (() => void) | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let warnedUnavailable = false;
let buttonComponent: any;
let settingsIcon: any;
let buttonIconSize = 20;

function moduleExports(id: number) {
	try {
		return ModuleRequire.__r?.(id);
	} catch {
		return undefined;
	}
}

function componentMatches(value: any, names: string[], seen = new Set<object>()): boolean {
	if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return false;
	seen.add(value);
	if (names.includes(value.displayName ?? value.name ?? "")) return true;
	return componentMatches(value.type, names, seen) || componentMatches(value.render, names, seen);
}

function isComponent(value: any): boolean {
	return typeof value === "function"
		|| Boolean(value && typeof value === "object" && (typeof value.type === "function" || typeof value.render === "function"));
}

function exportModule(id: number, names: string[], property?: string) {
	const direct = moduleExports(id);
	const hasExport = (candidate: any) => {
		const source = candidate?.default && typeof candidate.default === "object"
			? candidate.default
			: candidate;
		return property
			? property in Object(source)
			: componentMatches(source, names)
				|| componentMatches(source?.default, names)
				|| names.some((name) => componentMatches(source?.[name], names));
	};
	if (direct && (hasExport(direct) || isComponent(direct.default) || isComponent(direct))) return direct;
	return find((candidate: any) => hasExport(candidate));
}

function resolveTarget(module: any, key: string) {
	let target = module;
	let targetKey = key;
	let component = target?.[targetKey];
	while (component && typeof component !== "function") {
		if (typeof component.type === "function") {
			target = component;
			targetKey = "type";
		} else if (typeof component.render === "function") {
			target = component;
			targetKey = "render";
		} else {
			return undefined;
		}
		component = target[targetKey];
	}
	return typeof component === "function" ? { target, key: targetKey } : undefined;
}

function getButtonComponent() {
	if (!buttonComponent) {
		const direct = moduleExports(YOU_BAR_BUTTON_MODULE);
		const module = direct && (isComponent(direct.default) || isComponent(direct) || componentMatches(direct, ["YouBarButton"]))
			? direct
			: exportModule(YOU_BAR_BUTTON_MODULE, ["YouBarButton"]);
		const candidate = module?.YouBarButton
			?? module?.default?.YouBarButton
			?? module?.default
			?? module;
		buttonComponent = isComponent(candidate) ? candidate : undefined;
	}
	return buttonComponent;
}

function getSettingsIcon() {
	if (!settingsIcon) {
		const direct = moduleExports(SETTINGS_ICON_MODULE);
		const module = direct?.SettingsIcon || direct?.default?.SettingsIcon
			? direct
			: exportModule(SETTINGS_ICON_MODULE, [], "SettingsIcon");
		settingsIcon = module?.SettingsIcon ?? module?.default?.SettingsIcon;
	}
	return settingsIcon;
}

function ProfileManagerButton({ hasNameplate }: { hasNameplate: boolean }) {
	useProxy(storage);
	const navigation = NavigationNative.useNavigation();
	if (storage.showInProfile === false) return null;
	const Button = getButtonComponent();
	const Icon = getSettingsIcon();
	if (!Button || !Icon) return null;
	return React.createElement(Button, {
		hasNameplate,
		hasBadge: false,
		accessibilityLabel: "Open Tenshi's Plugins",
		onPress: () => {
			try {
				if (!navigateToManager(Settings, navigation)) {
					console.warn("[Tenshi's Plugins] Profile button could not open the manager because navigation is unavailable.");
				}
			} catch (error) {
				console.error("[Tenshi's Plugins] Profile button could not open the manager.", error);
			}
		},
		icon: React.createElement(Icon, {
			size: "custom",
			style: { width: buttonIconSize, height: buttonIconSize },
			color: hasNameplate ? "white" : undefined,
		}),
	});
}

function installButtonPatch() {
	if (unpatch) return true;
	const directModule = moduleExports(YOU_BAR_BUTTONS_MODULE);
	const directTarget = directModule && resolveTarget(directModule, "default");
	const module = directTarget
		? directModule
		: exportModule(YOU_BAR_BUTTONS_MODULE, ["YouBarButtons", "YouBarNotificationsButton"]);
	const target = directTarget ?? (module && resolveTarget(module, "default"));
	const Button = getButtonComponent();
	const Icon = getSettingsIcon();
	if (!module || !target || !Button || !Icon) {
		if (!warnedUnavailable) {
			console.warn("[Tenshi's Plugins] Could not locate Discord's profile-bar button components yet.");
			warnedUnavailable = true;
		}
		return false;
	}
	const constants = moduleExports(YOU_BAR_CONSTANTS_MODULE);
	const size = Number(constants?.YOU_BAR_BUTTON_ICON_SIZE);
	if (Number.isFinite(size) && size > 0) buttonIconSize = size;
	try {
		unpatch = instead(target.key, target.target, (args: any[], original: (...args: any[]) => any) => {
			const result = original(...args);
			return React.createElement(
				Symbol.for("react.fragment"),
				null,
				result,
				React.createElement(ProfileManagerButton, { hasNameplate: Boolean(args[0]?.hasNameplate) }),
			);
		});
		warnedUnavailable = false;
		console.info("[Tenshi's Plugins] Added the profile button to Discord's profile controls.");
		return true;
	} catch (error) {
		console.error("[Tenshi's Plugins] Could not add its profile-bar button.", error);
		return false;
	}
}

function retryInstall() {
	if (storage.showInProfile !== false) installButtonPatch();
}

export function registerProfileButton() {
	installButtonPatch();
	if (!retryTimer) retryTimer = setInterval(retryInstall, 5000);
	return () => {
		if (retryTimer) clearInterval(retryTimer);
		retryTimer = undefined;
		unpatch?.();
		unpatch = undefined;
		buttonComponent = undefined;
		settingsIcon = undefined;
	};
}
