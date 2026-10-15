import { installSettingsPin } from "./settingsPin";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
import { installCrashCapture, recoverFromLastCrash } from "./crashLog";
import { enableDeveloperMode, installDeveloperModeGuard, stopDeveloperModeRetries } from "./developerMode";

let unpatchSettings: (() => void) | undefined;
let unpatchCrashCapture: (() => void) | undefined;
let unpatchDeveloperMode: (() => void) | undefined;

export default {
	onLoad() {
		unpatchSettings = installSettingsPin();
		unpatchCrashCapture = installCrashCapture();
		unpatchDeveloperMode = installDeveloperModeGuard();
		enableDeveloperMode();
		void recoverFromLastCrash();
		resumeManagerAfterReload(Settings);
	},
	onUnload() {
		unpatchSettings?.();
		unpatchSettings = undefined;
		unpatchCrashCapture?.();
		unpatchCrashCapture = undefined;
		unpatchDeveloperMode?.();
		unpatchDeveloperMode = undefined;
		stopDeveloperModeRetries();
	},
};
