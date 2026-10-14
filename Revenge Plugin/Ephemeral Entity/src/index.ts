import { findByProps } from "@vendetta/metro";
import { instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { anonymizeUploadFiles, METHODS, type AnonymizationMethod } from "./filenames";
import Settings from "./settings";

const defaults = {
	anonymiseByDefault: true,
	method: "random" as AnonymizationMethod,
	randomizedLength: 7,
	consistentName: "image",
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
		if (typeof uploadModule?.uploadFiles !== "function") {
			console.warn("[Ephemeral Entity] Discord's file upload module was not found; filenames will not be anonymized.");
			return;
		}

		unpatches.push(
			instead("uploadFiles", uploadModule, (args, original) => {
				if (storage.anonymiseByDefault) {
					anonymizeUploadFiles(args[0], normalizeSettings());
				}
				return original(...args);
			}),
		);
	},
	onUnload() {
		for (const unpatch of unpatches.splice(0)) unpatch();
	},
	settings: Settings,
};
