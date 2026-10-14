import { installSettingsPin } from "./settingsPin";

let unpatchSettings: (() => void) | undefined;

export default {
	onLoad() {
		unpatchSettings = installSettingsPin();
	},
	onUnload() {
		unpatchSettings?.();
		unpatchSettings = undefined;
	},
};
