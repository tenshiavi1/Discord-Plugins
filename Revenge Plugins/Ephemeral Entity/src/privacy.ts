import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";

let typingUnpatch: (() => void) | undefined;
let typingStatusHidden = false;

export function setTypingStatusHidden(enabled: boolean) {
	typingStatusHidden = enabled;
	if (typingUnpatch) return;

	const typingActions = findByProps("startTyping", "stopTyping") ?? findByProps("startTyping");
	if (typeof typingActions?.startTyping !== "function") {
		console.warn("[Ephemeral Entity] Discord's typing-start action was not found; Silent Typing is unavailable.");
		return;
	}

	typingUnpatch = instead("startTyping", typingActions, (args, original) => {
		if (!typingStatusHidden) return original(...args);
	});
}

export function clearTypingStatusPatch() {
	typingStatusHidden = false;
	typingUnpatch?.();
	typingUnpatch = undefined;
}
