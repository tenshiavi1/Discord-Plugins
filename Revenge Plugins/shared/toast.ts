import { showToast as showDefaultToast } from "@vendetta/ui/toasts";

export function showToast(content: string, icon?: number): void {
	const characters = Array.from(content);
	const toastContent = characters.length > 100
		? `${characters.slice(0, 97).join("").trimEnd()}…`
		: content;
	showDefaultToast(toastContent, icon);
}
