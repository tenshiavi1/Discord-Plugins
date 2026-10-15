import { toasts } from "@vendetta/metro/common";
import { showToast as showDefaultToast } from "@vendetta/ui/toasts";

type ToastCreators = {
	open: (options: {
		key: string;
		content: string;
		icon?: number;
		source?: number;
		toastDurationMs: number;
	}) => void;
};

let toastSequence = 0;

export function showToast(content: string, icon?: number): void {
	const characters = Array.from(content);
	const toastContent = characters.length > 100
		? `${characters.slice(0, 97).join("").trimEnd()}…`
		: content;
	try {
		(toasts as ToastCreators).open({
			key: `tenshi-plugin-toast-${Date.now()}-${toastSequence++}-${Math.random().toString(36).slice(2)}`,
			content: toastContent,
			icon,
			source: icon,
			toastDurationMs: 3000,
		});
	} catch (error) {
		console.warn("[Tenshi Plugins] Could not show a 3-second toast; using the client default.", error);
		showDefaultToast(toastContent, icon);
	}
}
