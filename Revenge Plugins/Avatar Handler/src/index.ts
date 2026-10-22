import { storage } from "@vendetta/plugin";
import { installPluginCrashGuard } from "../../shared/crashGuard";
import Settings from "./settings";
import { disableNativeSwitcher, enableNativeSwitcher } from "./nativeSwitcher";
import { registerPluginSettingsShortcut } from "../../shared/pluginSettings";

const registerCrashGuard = () => installPluginCrashGuard("Avatar Handler", storage, {
	features: [{ storageKey: "enabled" }],
	fallbackKeys: ["enabled"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();
let unregisterSettingsShortcut: (() => void) | undefined;

export default {
	onLoad() {
		removeCrashGuard ??= registerCrashGuard();
		if (storage.enabled === undefined) storage.enabled = true;
		storage.showInSettings ??= false;
		unregisterSettingsShortcut = registerPluginSettingsShortcut({
			id: "avatar-handler",
			title: "Avatar Handler",
			icon: "ic_person_waving",
			page: Settings,
			visible: storage.showInSettings === true,
		});
		if (storage.enabled && !enableNativeSwitcher()) {
			storage.enabled = false;
		}
	},
	onUnload() {
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		disableNativeSwitcher();
		unregisterSettingsShortcut?.();
		unregisterSettingsShortcut = undefined;
	},
	settings: Settings,
};
