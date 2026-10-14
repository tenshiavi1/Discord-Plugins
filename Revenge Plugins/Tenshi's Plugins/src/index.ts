import { installSettingsPin } from "./settingsPin";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";

let unpatchSettings: (() => void) | undefined;

export default {
	onLoad() {
		unpatchSettings = installSettingsPin();
		resumeManagerAfterReload(Settings);
	},
	onUnload() {
		unpatchSettings?.();
		unpatchSettings = undefined;
	},
};
