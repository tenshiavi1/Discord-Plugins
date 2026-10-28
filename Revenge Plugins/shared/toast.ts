import { toasts } from "@vendetta/metro/common";

let toastSequence = 0;

export function showToast(content: string, icon?: number): void {
	const characters = Array.from(content);
	const toastContent = characters.length > 100
		? `${characters.slice(0, 97).join("").trimEnd()}…`
		: content;
	const key = `revenge-plugin-${Date.now()}-${++toastSequence}-${Math.random().toString(36).slice(2)}`;
	try {
		if (typeof toasts?.openMana === "function") {
			toasts.openMana(key, {
				text: toastContent,
				...(typeof icon === "number" ? { icon } : {}),
			});
			return;
		}
		if (typeof toasts?.open !== "function") {
			console.error("[Revenge Plugins] Discord's toast API is unavailable.");
			return;
		}
		toasts.open(key, { text: toastContent });
	} catch (error) {
		console.error("[Revenge Plugins] Could not show toast.", error);
	}
}
