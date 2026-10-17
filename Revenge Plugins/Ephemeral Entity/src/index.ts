import { findByProps, findByPropsAll } from "../../compat";
import { instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { registerCommand } from "@vendetta/commands";
import { showToast } from "../../shared/toast";
import { anonymizeUploadFiles, METHODS, type AnonymizationMethod } from "./filenames";
import { clearTrackingUrlsInMessage } from "./urls";
import { clearTypingStatusPatch, setTypingStatusHidden } from "./privacy";
import Settings from "./settings";
import { installPluginCrashGuard } from "../../shared/crashGuard";

const registerCrashGuard = () => installPluginCrashGuard("Ephemeral Entity", storage, {
	features: [
		{ storageKey: "anonymiseByDefault", patterns: [/anonymi[sz]eUploadFiles|anonymi[sz]eByDefault|uploadFiles/i] },
		{ storageKey: "clearTrackingUrls", patterns: [/clearTrackingUrls|tracking.?url|sendMessage|editMessage/i] },
		{ storageKey: "enableSilentLeave", patterns: [/silent.?leave|leaveSilent/i] },
		{ storageKey: "hideTypingStatus", patterns: [/setTypingStatusHidden|hideTypingStatus|silent.?typ/i] },
	],
	fallbackKeys: ["anonymiseByDefault", "clearTrackingUrls", "enableSilentLeave", "hideTypingStatus"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();

const defaults = {
	anonymiseByDefault: true,
	method: "random" as AnonymizationMethod,
	randomizedLength: 7,
	consistentName: "file",
	clearTrackingUrls: true,
	enableSilentLeave: true,
	hideTypingStatus: true,
};

const unpatches: (() => void)[] = [];
const unregisterCommands: (() => void)[] = [];
const channelStore = findByProps("getChannel");
const apiUtils = findByProps("getAPIBaseURL", "del");

function setSilentTyping(enabled: boolean) {
	storage.hideTypingStatus = enabled;
	setTypingStatusHidden(enabled);
	showToast(`Silent typing is ${enabled ? "enabled" : "disabled"}.`);
}

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
		removeCrashGuard ??= registerCrashGuard();
		for (const [key, value] of Object.entries(defaults)) {
			if (storage[key] === undefined) storage[key] = value;
		}

		setTypingStatusHidden(Boolean(storage.hideTypingStatus));

		if (typeof channelStore?.getChannel === "function" && typeof apiUtils?.del === "function") {
			try {
				unregisterCommands.push(registerCommand({
					name: "leave silent",
					description: "Leave the current Group DM silently.",
					options: [],
					predicate: (context: any) => {
						if (!storage.enableSilentLeave) return false;
						const channel = channelStore.getChannel(context?.channel?.id);
						return channel?.type === 3;
					},
					execute: async (_args: unknown, context: any) => {
						const channelId = context?.channel?.id;
						if (!channelId) {
							showToast("Could not find the current group DM. Open the conversation and try again.");
							return;
						}
						try {
							await apiUtils.del({
								url: `/channels/${channelId}`,
								query: "silent=true",
							});
							showToast("You left the group DM.");
						} catch (error) {
							console.error("[Ephemeral Entity] Could not silently leave the Group DM.", error);
							showToast("Could not leave the group DM. Check your connection and try again.");
						}
					},
				}));
			} catch (error) {
				console.error("[Ephemeral Entity] Could not register the silent-leave command.", error);
			}
		} else {
			console.warn("[Ephemeral Entity] Discord's channel or API module was not found; silent leave is unavailable.");
		}

		try {
			unregisterCommands.push(registerCommand({
				name: "silenttype",
				displayName: "Silent Typing",
				description: "Toggle whether your typing status is sent.",
				options: [],
				execute: () => {
					setSilentTyping(!Boolean(storage.hideTypingStatus));
				},
			}));
		} catch (error) {
			console.error("[Ephemeral Entity] Could not register the silent-typing command.", error);
		}

		const uploadModules = findByPropsAll("uploadFiles")
			.map((exports) => exports?.default ?? exports);
		const distinctUploadModules = new Set(uploadModules);
		let patchedUploadModules = 0;
		for (const uploadModule of distinctUploadModules) {
			if (typeof uploadModule?.uploadFiles !== "function") continue;
			unpatches.push(
				instead("uploadFiles", uploadModule, (args, original) => {
					if (storage.anonymiseByDefault && !anonymizeUploadFiles(args[0], normalizeSettings())) {
						showToast("Could not anonymize every file name. Upload canceled.");
						return;
					}
					return original(...args);
				}),
			);
			patchedUploadModules++;
		}
		if (patchedUploadModules === 0) {
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
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		for (const unpatch of unpatches.splice(0)) unpatch();
		clearTypingStatusPatch();
		for (const unregister of unregisterCommands.splice(0)) unregister();
	},
	settings: Settings,
};
