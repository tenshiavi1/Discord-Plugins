import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { disableNativeSwitcher, enableNativeSwitcher } from "./nativeSwitcher";

export default {
	onLoad() {
		if (storage.enabled === undefined) storage.enabled = true;
		if (storage.enabled && !enableNativeSwitcher()) {
			storage.enabled = false;
		}
	},
	onUnload() {
		disableNativeSwitcher();
	},
	settings: Settings,
};
