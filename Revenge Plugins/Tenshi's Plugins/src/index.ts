import { storage } from "@vendetta/plugin";
import { installCrashCapture, recoverLegacyPendingDisables } from "./crashLog";
import { cancelScheduledAutoFetch, clearStaleAutoFetchState, scheduleAutoFetchOnStartup } from "./autoFetch";
import { settleManagerRestartOnStartup } from "./restartState";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
import { enableDeveloperMode, installDeveloperModeGuard, stopDeveloperModeRetries } from "./developerMode";
import { registerProfileButton } from "./profileButton";

let unregisterProfileButton: (() => void) | undefined;
let unpatchCrashCapture: (() => void) | undefined;
let unpatchDeveloperMode: (() => void) | undefined;

export default {
	onLoad() {
		clearStaleAutoFetchState();
		settleManagerRestartOnStartup();
		storage.showInProfile ??= storage.showInSettings !== false;
		delete storage.showInSettings;
		unregisterProfileButton = registerProfileButton();
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
		unregisterProfileButton?.();
		unregisterProfileButton = undefined;
		unpatchCrashCapture?.();
		unpatchCrashCapture = undefined;
		unpatchDeveloperMode?.();
		unpatchDeveloperMode = undefined;
		stopDeveloperModeRetries();
	},
	settings: Settings,
};
