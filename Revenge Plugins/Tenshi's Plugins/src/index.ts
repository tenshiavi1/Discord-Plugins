import { storage } from "@vendetta/plugin";
import { installCrashCapture, recoverLegacyPendingDisables } from "./crashLog";
import { cancelScheduledAutoFetch, clearStaleAutoFetchState, scheduleAutoFetchOnStartup } from "./autoFetch";
import { settleManagerRestartOnStartup } from "./restartState";
import Settings from "./settings";
import { resumeManagerAfterReload } from "./managerNavigation";
import { enableDeveloperMode, installDeveloperModeGuard, stopDeveloperModeRetries } from "./developerMode";
import { registerPluginSettingsShortcut } from "../../shared/pluginSettings";

let unregisterSettingsShortcut: (() => void) | undefined;
let unpatchCrashCapture: (() => void) | undefined;
let unpatchDeveloperMode: (() => void) | undefined;

export default {
	onLoad() {
		clearStaleAutoFetchState();
		settleManagerRestartOnStartup();
		storage.showInSettings ??= storage.showInProfile !== false;
		delete storage.showInProfile;
		unregisterSettingsShortcut = registerPluginSettingsShortcut({
			id: "tenshi-plugins",
			title: "Tenshi's Plugins",
			icon: "ChatCheckIcon",
			page: Settings,
			visible: storage.showInSettings !== false,
		});
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
		unregisterSettingsShortcut?.();
		unregisterSettingsShortcut = undefined;
		unpatchCrashCapture?.();
		unpatchCrashCapture = undefined;
		unpatchDeveloperMode?.();
		unpatchDeveloperMode = undefined;
		stopDeveloperModeRetries();
	},
	settings: Settings,
};
