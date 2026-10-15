import { installCrashCapture, recoverLegacyPendingDisables } from "./crashLog";
import { cancelScheduledAutoFetch, clearStaleAutoFetchState, scheduleAutoFetchOnStartup } from "./autoFetch";
import { settleManagerRestartOnStartup } from "./restartState";
import { installSettingsPin } from "./settingsPin";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
import { enableDeveloperMode, installDeveloperModeGuard, stopDeveloperModeRetries } from "./developerMode";

let unpatchSettings: (() => void) | undefined;
let unpatchCrashCapture: (() => void) | undefined;
let unpatchDeveloperMode: (() => void) | undefined;

export default {
	onLoad() {
		clearStaleAutoFetchState();
		settleManagerRestartOnStartup();
		unpatchSettings = installSettingsPin();
		unpatchCrashCapture = installCrashCapture();
		unpatchDeveloperMode = installDeveloperModeGuard();
		enableDeveloperMode();
		void recoverLegacyPendingDisables()
			.catch((error) => console.error("[Tenshi's Plugins] Legacy crash recovery failed.", error))
			.finally(scheduleAutoFetchOnStartup);
		resumeManagerAfterReload(Settings);
	},
	onUnload() {
		cancelScheduledAutoFetch();
		unpatchSettings?.();
		unpatchSettings = undefined;
		unpatchCrashCapture?.();
		unpatchCrashCapture = undefined;
		unpatchDeveloperMode?.();
		unpatchDeveloperMode = undefined;
		stopDeveloperModeRetries();
	},
};
