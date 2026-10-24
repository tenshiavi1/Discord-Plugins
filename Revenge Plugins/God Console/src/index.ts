import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";
import { setAutoQuestOptions, stopAutoQuest } from "./autoQuest";
import { installPluginCrashGuard } from "../../shared/crashGuard";
import { registerPluginSettingsShortcut } from "../../shared/pluginSettings";

const registerCrashGuard = () => installPluginCrashGuard("God Console", storage, {
	features: [
		{ storageKey: "readAllEnabled", patterns: [/read.?all|setReadAllEnabled|mark.*read/i] },
		{ storageKey: "jumpToTopEnabled", patterns: [/jump.?to.?top|setJumpToTopEnabled/i] },
		{ storageKey: "validUserEnabled", patterns: [/valid.?user|setValidUserEnabled|fetch.*user/i] },
		{ storageKey: "autoQuestEnabled", patterns: [/auto.?quest|QuestStore|video-progress|heartbeat/i] },
	],
	fallbackKeys: ["readAllEnabled", "jumpToTopEnabled", "validUserEnabled", "autoQuestEnabled"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();
let unregisterSettingsShortcut: (() => void) | undefined;

function applySettings() {
	setReadAllEnabled(Boolean(storage.readAllEnabled));
	setJumpToTopEnabled(Boolean(storage.jumpToTopEnabled));
	setValidUserEnabled(Boolean(storage.validUserEnabled));
	setAutoQuestOptions({
		enabled: Boolean(storage.autoQuestEnabled),
		video: storage.autoQuestVideo !== false,
		activity: storage.autoQuestActivity !== false,
		enroll: storage.autoQuestEnroll !== false,
	});
}

export default {
	onLoad() {
		removeCrashGuard ??= registerCrashGuard();
		storage.readAllEnabled ??= true;
		storage.jumpToTopEnabled ??= true;
		storage.validUserEnabled ??= true;
		storage.autoQuestEnabled ??= false;
		storage.autoQuestVideo ??= true;
		storage.autoQuestActivity ??= true;
		storage.autoQuestEnroll ??= true;
		delete storage.addAttachmentsEnabled;
		storage.showInSettings ??= false;
		unregisterSettingsShortcut = registerPluginSettingsShortcut({
			id: "god-console",
			title: "God Console",
			icon: "ic_check",
			page: Settings,
			visible: storage.showInSettings === true,
		});
		applySettings();
	},
	onUnload() {
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		setReadAllEnabled(false);
		setJumpToTopEnabled(false);
		setValidUserEnabled(false);
		stopAutoQuest();
		unregisterSettingsShortcut?.();
		unregisterSettingsShortcut = undefined;
	},
	settings: Settings,
};