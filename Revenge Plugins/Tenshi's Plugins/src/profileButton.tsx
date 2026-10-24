import { instead } from "@vendetta/patcher";
import { NavigationNative, React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { find } from "../../compat";
import Settings from "./settings";
import { navigateToManager } from "./managerNavigation";
import { findComponentTarget, findDefaultComponentTarget, selectComponentModule } from "./profileButtonCore";

const YOU_BAR_BUTTONS_MODULE = 16335;
const YOU_BAR_CONSTANTS_MODULE = 14899;
const COMPONENT_NAMES = ["YouBarButtons", "YouBarNotificationsButton"];
type MetroModuleRecord = {
	factory?: (...args: any[]) => any;
	isInitialized?: boolean;
};
const MetroRuntime = globalThis as typeof globalThis & {
	__r?: (id: number) => any;
	modules?: Record<number, MetroModuleRecord>;
};
const reportedRequireFailures = new Set<number>();
let unpatch: (() => void) | undefined;
let restoreFactory: (() => void) | undefined;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let warnedUnavailable = false;
let buttonIconSize = 20;

function moduleExports(id: number) {
	try {
		return MetroRuntime.__r?.(id);
	} catch (error) {
		if (!reportedRequireFailures.has(id)) {
			console.error(`[Tenshi's Plugins] Could not load Discord module ${id}.`, error);
			reportedRequireFailures.add(id);
		}
		return undefined;
	}
}

function patchTarget(target: { target: any; key: string }) {
	if (unpatch) return;
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
		console.info("[Tenshi's Plugins] Patched Discord's profile-bar component.");
	} catch (error) {
		console.error("[Tenshi's Plugins] Could not add its profile-bar button.", error);
	}
}

function installFactoryHook() {
	if (restoreFactory) return;
	const record = MetroRuntime.modules?.[YOU_BAR_BUTTONS_MODULE];
	if (!record || record.isInitialized !== false || typeof record.factory !== "function") return false;

	const originalFactory = record.factory;
	const wrappedFactory = function (this: unknown, ...args: any[]) {
		const result = originalFactory.apply(this, args);
		const module = args[4]?.exports;
		const target = findDefaultComponentTarget(module);
		if (target) patchTarget(target);
		return result;
	};
	try {
		record.factory = wrappedFactory;
		restoreFactory = () => {
			if (record.factory === wrappedFactory) record.factory = originalFactory;
		};
		return true;
	} catch (error) {
		console.error("[Tenshi's Plugins] Could not hook Discord's profile-bar module factory.", error);
		return false;
	}
}

function ProfileManagerButton({ hasNameplate }: { hasNameplate: boolean }) {
	useProxy(storage);
	const navigation = NavigationNative.useNavigation();
	if (storage.showInProfile === false) return null;
	const Pressable = RN.Pressable ?? RN.TouchableOpacity;
	const icon = getAssetIDByName("SettingsIcon") ?? getAssetIDByName("WrenchIcon");
	return React.createElement(
		Pressable,
		{
			accessibilityRole: "button",
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
			style: {
				width: buttonIconSize + 24,
				height: buttonIconSize + 24,
				alignItems: "center",
				justifyContent: "center",
				borderRadius: 16,
				backgroundColor: hasNameplate ? "#ffffff18" : "#1e1f22",
			},
		},
		icon
			? React.createElement(RN.Image, {
				source: icon,
				style: { width: buttonIconSize, height: buttonIconSize, tintColor: hasNameplate ? "white" : "#f2f3f5" },
			})
			: React.createElement(RN.Text, { style: { color: hasNameplate ? "white" : "#f2f3f5", fontSize: buttonIconSize } }, "⚙"),
	);
}

function installButtonPatch() {
	if (unpatch) return true;
	const factoryHookInstalled = installFactoryHook();
	const directModule = moduleExports(YOU_BAR_BUTTONS_MODULE);
	const directTarget = findDefaultComponentTarget(directModule)
		?? findComponentTarget(directModule, COMPONENT_NAMES);
	const module = directTarget
		? undefined
		: selectComponentModule(undefined, COMPONENT_NAMES, (predicate) => find(predicate));
	const target = directTarget ?? findComponentTarget(module, COMPONENT_NAMES);
	if (!target) {
		if (!warnedUnavailable) {
			const record = MetroRuntime.modules?.[YOU_BAR_BUTTONS_MODULE];
			console.warn(
				"[Tenshi's Plugins] Could not locate Discord's profile-bar button component.",
				{ moduleId: YOU_BAR_BUTTONS_MODULE, moduleInitialized: record?.isInitialized, factoryHookInstalled },
			);
			warnedUnavailable = true;
		}
		return false;
	}
	const constants = moduleExports(YOU_BAR_CONSTANTS_MODULE);
	const size = Number(constants?.YOU_BAR_BUTTON_ICON_SIZE);
	if (Number.isFinite(size) && size > 0) buttonIconSize = size;
	patchTarget(target);
	return Boolean(unpatch);
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
		restoreFactory?.();
		restoreFactory = undefined;
	};
}
