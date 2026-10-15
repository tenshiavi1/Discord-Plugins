import { storage } from "@vendetta/plugin";
import Settings from "./settings";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";

function applySettings() {
	setReadAllEnabled(Boolean(storage.readAllEnabled));
	setJumpToTopEnabled(Boolean(storage.jumpToTopEnabled));
	setValidUserEnabled(Boolean(storage.validUserEnabled));
}

export default {
	onLoad() {
		storage.readAllEnabled ??= true;
		storage.jumpToTopEnabled ??= true;
		storage.validUserEnabled ??= true;
		applySettings();
	},
	onUnload() {
		setReadAllEnabled(false);
		setJumpToTopEnabled(false);
		setValidUserEnabled(false);
	},
	settings: Settings,
};