import { installSettingsPin } from "./settingsPin";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
import { installCrashCapture } from "./crashLog";

let unpatchSettings: (() => void) | undefined;
let unpatchCrashCapture: (() => void) | undefined;

export default {
	onLoad() {
		unpatchSettings = installSettingsPin();
		unpatchCrashCapture = installCrashCapture();
		resumeManagerAfterReload(Settings);
	},
	onUnload() {
		unpatchSettings?.();
		unpatchSettings = undefined;
		unpatchCrashCapture?.();
		unpatchCrashCapture = undefined;
	},
};
