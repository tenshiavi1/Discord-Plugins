import { storage } from "@vendetta/plugin";
import { installPluginCrashGuard } from "../../shared/crashGuard";
import Settings from "./settings";
import { disableNativeSwitcher, enableNativeSwitcher } from "./nativeSwitcher";

const registerCrashGuard = () => installPluginCrashGuard("Avatar Handler", storage, {
	features: [{ storageKey: "enabled" }],
	fallbackKeys: ["enabled"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();

export default {
	onLoad() {
		removeCrashGuard ??= registerCrashGuard();
		if (storage.enabled === undefined) storage.enabled = true;
		if (storage.enabled && !enableNativeSwitcher()) {
			storage.enabled = false;
		}
	},
	onUnload() {
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		disableNativeSwitcher();
	},
	settings: Settings,
};
