import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

let typingUnpatches: (() => void)[] = [];

export function setTypingStatusHidden(enabled: boolean) {
	for (const unpatch of typingUnpatches.splice(0)) unpatch();
	if (!enabled) return;

	const typingActions = findByProps("startTyping", "stopTyping") ?? findByProps("startTyping");
	if (!typingActions) {
		console.warn("[Ephemeral Entity] Discord's typing actions were not found; typing status will not be hidden.");
		return;
	}

	for (const method of ["startTyping", "stopTyping"]) {
		if (typeof typingActions[method] === "function") {
			typingUnpatches.push(instead(method, typingActions, () => {}));
		}
	}

	if (typingUnpatches.length === 0) {
		console.warn("[Ephemeral Entity] Discord's typing actions could not be patched; typing status will not be hidden.");
	}
}

export function clearTypingStatusPatch() {
	setTypingStatusHidden(false);
}
