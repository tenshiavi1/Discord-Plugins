import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { anonymizeUploadFiles, METHODS, type AnonymizationMethod } from "./filenames";
import { clearTrackingUrlsInMessage } from "./urls";
import Settings from "./settings";

const defaults = {
	anonymiseByDefault: true,
	method: "random" as AnonymizationMethod,
	randomizedLength: 7,
	consistentName: "image",
	clearTrackingUrls: true,
};

const unpatches: (() => void)[] = [];

function normalizeSettings() {
	const method = METHODS.some((option) => option.value === storage.method)
		? storage.method as AnonymizationMethod
		: defaults.method;
	const randomizedLength = Number(storage.randomizedLength);

	return {
		method,
		randomizedLength: Number.isFinite(randomizedLength)
			? Math.max(1, Math.min(64, Math.floor(randomizedLength)))
			: defaults.randomizedLength,
		consistentName: typeof storage.consistentName === "string"
			? storage.consistentName.replace(/[\\/]/g, "").trim()
			: defaults.consistentName,
	};
}

export default {
	onLoad() {
		for (const [key, value] of Object.entries(defaults)) {
			if (storage[key] === undefined) storage[key] = value;
		}

		const uploadModule = findByProps("uploadFiles");
		if (typeof uploadModule?.uploadFiles === "function") {
			unpatches.push(
				instead("uploadFiles", uploadModule, (args, original) => {
					if (storage.anonymiseByDefault) {
						anonymizeUploadFiles(args[0], normalizeSettings());
					}
					return original(...args);
				}),
			);
		} else {
			console.warn("[Ephemeral Entity] Discord's file upload module was not found; filenames will not be anonymized.");
		}

		const messageActions = findByProps("sendMessage", "editMessage") ?? findByProps("sendMessage");
		let patchedMessageMethods = 0;
		for (const [method, messageIndex] of [["sendMessage", 1], ["editMessage", 2]] as const) {
			if (typeof messageActions?.[method] !== "function") continue;

			unpatches.push(
				instead(method, messageActions, (args, original) => {
					if (!storage.clearTrackingUrls) return original(...args);

					const message = args[messageIndex];
					const cleanedMessage = clearTrackingUrlsInMessage(message);
					if (cleanedMessage === message) return original(...args);

					const nextArgs = [...args];
					nextArgs[messageIndex] = cleanedMessage;
					return original(...nextArgs);
				}),
			);
			patchedMessageMethods++;
		}

		if (patchedMessageMethods === 0) {
			console.warn("[Ephemeral Entity] Discord's message send/edit actions were not found; tracking URLs will not be cleaned.");
		}
	},
	onUnload() {
		for (const unpatch of unpatches.splice(0)) unpatch();
	},
	settings: Settings,
};
