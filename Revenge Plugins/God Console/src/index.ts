import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";
import { setAddAttachmentsEnabled } from "./addAttachments";
import { installPluginCrashGuard } from "../../shared/crashGuard";

const registerCrashGuard = () => installPluginCrashGuard("God Console", storage, {
	features: [
		{ storageKey: "readAllEnabled", patterns: [/read.?all|setReadAllEnabled|mark.*read/i] },
		{ storageKey: "jumpToTopEnabled", patterns: [/jump.?to.?top|setJumpToTopEnabled/i] },
		{ storageKey: "validUserEnabled", patterns: [/valid.?user|setValidUserEnabled|fetch.*user/i] },
		{ storageKey: "addAttachmentsEnabled", patterns: [/add.?attachments|setAddAttachmentsEnabled|uploadAttachment/i] },
	],
	fallbackKeys: ["readAllEnabled", "jumpToTopEnabled", "validUserEnabled", "addAttachmentsEnabled"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();

function applySettings() {
	setReadAllEnabled(Boolean(storage.readAllEnabled));
	setJumpToTopEnabled(Boolean(storage.jumpToTopEnabled));
	setValidUserEnabled(Boolean(storage.validUserEnabled));
	setAddAttachmentsEnabled(Boolean(storage.addAttachmentsEnabled));
}

export default {
	onLoad() {
		removeCrashGuard ??= registerCrashGuard();
		storage.readAllEnabled ??= true;
		storage.jumpToTopEnabled ??= true;
		storage.validUserEnabled ??= true;
		storage.addAttachmentsEnabled ??= true;
		applySettings();
	},
	onUnload() {
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		setReadAllEnabled(false);
		setJumpToTopEnabled(false);
		setValidUserEnabled(false);
		setAddAttachmentsEnabled(false);
	},
	settings: Settings,
};