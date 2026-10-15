import { installCrashCapture, recoverLegacyPendingDisables } from "./crashLog";
import { installSettingsPin } from "./settingsPin";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
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
		void recoverLegacyPendingDisables();
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
