import { find, findByProps, findByName } from "../../compat";
import { constants, React, ReactNative as RN } from "@vendetta/metro/common";
import AlertContent from "./AlertContent";
import { Settings } from "./settings";
import { getAssetIDByName } from "@vendetta/ui/assets";

import { after, instead } from "@vendetta/patcher";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { storage } from "@vendetta/plugin";
import { initializeMessageHistory, removeMessageHistoryPatch } from "./messageHistory";
import { registerHiddenChannelFeatureToggle } from "./hiddenChannelToggle";
import { registerMessageHistoryFeatureToggle } from "./messageHistoryToggle";
import { setServerInfoFeatureEnabled } from "./serverInfo";

const Permissions = findByProps("getChannelPermissions", "can");
const channelTypes = findByProps("ChannelTypes")?.ChannelTypes;
const channelModule = findByProps("getChannel") ?? findByName("getChannel", false);
const getChannel = typeof channelModule === "function"
	? channelModule
	: typeof channelModule?.getChannel === "function"
		? channelModule.getChannel.bind(channelModule)
		: undefined;
const internalPermissionChecks = new WeakSet<object>();
let hiddenChannelFeatureEnabled = false;
let messageHistoryFeatureEnabled = false;
const skipChannels = [
	channelTypes?.DM ?? 1,
	channelTypes?.GROUP_DM ?? 3,
	channelTypes?.GUILD_CATEGORY ?? 4,
];

function isHidden(channel: any | undefined) {
	if (!hiddenChannelFeatureEnabled || channel === undefined) return false;
	if (typeof channel === "string") channel = getChannel(channel);
	if (!channel || (typeof channel !== "object" && typeof channel !== "function")
		|| skipChannels.includes(channel.type)
		|| typeof Permissions?.can !== "function"
		|| constants?.Permissions?.VIEW_CHANNEL === undefined) return false;
	internalPermissionChecks.add(channel);
	try {
		return !Permissions.can(constants.Permissions.VIEW_CHANNEL, channel);
	} finally {
		internalPermissionChecks.delete(channel);
	}
}

const hiddenChannelUnpatches: (() => void)[] = [];
let obfuscationChanges: { target: object; flag: string; descriptor: PropertyDescriptor }[] = [];
let obfuscationOriginals = new WeakMap<object, Set<string>>();

const privateChannelHidingMarker = "2026-02-private-channel-hiding";
const privateChannelHidingFlags = ["enableObfuscation", "enableIntegrityCheck"];

function disablePrivateChannelObfuscation(value: any, depth = 0, seen = new Set<any>()) {
	if (value === null || (typeof value !== "object" && typeof value !== "function") || depth > 8 || seen.has(value)) return value;
	seen.add(value);

	try {
		for (const flag of privateChannelHidingFlags) {
			const descriptor = Object.getOwnPropertyDescriptor(value, flag);
			if (descriptor?.value !== true && !descriptor?.get) continue;

			try {
				const changedFlags = obfuscationOriginals.get(value) ?? new Set<string>();
				if (!changedFlags.has(flag)) {
					changedFlags.add(flag);
					obfuscationOriginals.set(value, changedFlags);
					obfuscationChanges.push({ target: value, flag, descriptor });
				}

				if (descriptor.configurable) {
					Object.defineProperty(value, flag, { configurable: true, enumerable: descriptor.enumerable, writable: true, value: false });
				} else if (descriptor.writable) {
					value[flag] = false;
				} else {
					console.warn(`[Sage Eyes] ${flag} is not writable.`);
				}
			} catch (error) {
				console.warn(`[Sage Eyes] Could not disable ${flag}.`, error);
			}
		}

		for (const key of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (descriptor && "value" in descriptor) {
				disablePrivateChannelObfuscation(descriptor.value, depth + 1, seen);
			}
		}
	} catch (error) {
		console.warn("[Sage Eyes] Could not inspect Discord's private-channel protection data.", error);
	}

	return value;
}

function patchObfuscationMethod(method: string, module: any) {
	const originalMethod = module[method];
	if (typeof originalMethod !== "function") return;

	const source = Function.prototype.toString.call(originalMethod);
	const isObfuscationMethod = source.includes(privateChannelHidingMarker)
		|| privateChannelHidingFlags.every((flag) => source.includes(flag));
	if (!isObfuscationMethod) return;

	hiddenChannelUnpatches.push(instead(method, module, (args, original) => {
		const result = original(...args.map((arg) => disablePrivateChannelObfuscation(arg)));
		const normalize = (value: any) => {
			if (value === true && isObfuscationMethod) return false;
			return disablePrivateChannelObfuscation(value);
		};

		if (result && typeof result.then === "function") return result.then(normalize);
		return normalize(result);
	}));
}

function patchPrivateChannelObfuscation() {
	const flagModule = findByProps(...privateChannelHidingFlags);
	if (flagModule) disablePrivateChannelObfuscation(flagModule);

	const sourceModule = find((candidate: any) => {
		if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return false;

		try {
			return Object.values(candidate).some((value) => {
				if (typeof value !== "function") return false;
				return Function.prototype.toString.call(value).includes(privateChannelHidingMarker);
			});
		} catch {
			return false;
		}
	});

	let patchedMethods = 0;
	if (sourceModule && (typeof sourceModule === "object" || typeof sourceModule === "function")) {
		disablePrivateChannelObfuscation(sourceModule);
		for (const method of Reflect.ownKeys(sourceModule)) {
			if (typeof method !== "string") continue;
			const previousUnpatchCount = hiddenChannelUnpatches.length;
			patchObfuscationMethod(method, sourceModule);
			if (hiddenChannelUnpatches.length > previousUnpatchCount) patchedMethods++;
		}
	}

	const guildChannelStore = findByProps("isChannelGated", "getChannels") || findByProps("isChannelGated");
	if (typeof guildChannelStore?.isChannelGated === "function") {
		hiddenChannelUnpatches.push(after("isChannelGated", guildChannelStore, () => false));
	}
	if (typeof guildChannelStore?.getChannels === "function") {
		hiddenChannelUnpatches.push(instead("getChannels", guildChannelStore, (args, original) => {
			const normalizedArgs = args.map((arg) => disablePrivateChannelObfuscation(arg));
			const result = original(normalizedArgs[0], true, ...normalizedArgs.slice(2));
			if (result && typeof result.then === "function") {
				return result.then((channels: any) => disablePrivateChannelObfuscation(channels));
			}
			return disablePrivateChannelObfuscation(result);
		}));
	}

	const channelStore = findByProps("getChannel", "getChannels") || findByProps("getChannel");
	if (typeof channelStore?.getChannel === "function") {
		hiddenChannelUnpatches.push(after("getChannel", channelStore, (_args, channel) => disablePrivateChannelObfuscation(channel)));
	}

	if (!flagModule && !patchedMethods) {
		console.warn("[Sage Eyes] Discord's private-channel name protection module was not found or could not be patched.");
	}
}

function restorePrivateChannelObfuscation() {
	for (const { target, flag, descriptor } of obfuscationChanges.splice(0).reverse()) {
		try {
			const current = Object.getOwnPropertyDescriptor(target, flag);
			if (current && "value" in current && current.value === false) {
				Object.defineProperty(target, flag, descriptor);
			}
		} catch (error) {
			console.warn(`[Sage Eyes] Could not restore ${flag}.`, error);
		}
	}
	obfuscationOriginals = new WeakMap<object, Set<string>>();
}

function setMessageHistoryFeatureEnabled(enabled: boolean) {
	if (enabled === messageHistoryFeatureEnabled) return;

	if (!enabled) {
		removeMessageHistoryPatch(false);
		messageHistoryFeatureEnabled = false;
		return;
	}

	if (!initializeMessageHistory(storage)) {
		removeMessageHistoryPatch();
		messageHistoryFeatureEnabled = false;
		storage.enableMessageHistory = false;
		showToast("Could not enable message history");
		return;
	}

	messageHistoryFeatureEnabled = true;
}

export function setHiddenChannelFeatureEnabled(enabled: boolean) {
	if (enabled === hiddenChannelFeatureEnabled) return;
	hiddenChannelFeatureEnabled = enabled;

	if (!enabled) {
		for (const unpatch of hiddenChannelUnpatches.splice(0).reverse()) unpatch();
		restorePrivateChannelObfuscation();
		return;
	}

	try {
		patchPrivateChannelObfuscation();

		if (typeof Permissions?.can === "function" && constants?.Permissions?.VIEW_CHANNEL !== undefined) {
			hiddenChannelUnpatches.push(
				after("can", Permissions, ([permID, channel], result) => {
					if (channel && !internalPermissionChecks.has(channel)
						&& permID === constants.Permissions.VIEW_CHANNEL) return true;
					return result;
				}),
			);
		} else {
			console.warn("[Sage Eyes] Discord's channel permission module was not found; hidden-channel detection is unavailable.");
		}

		const transitionToGuild = findByProps("transitionToGuild");
		if (transitionToGuild) {
			for (const key of Object.keys(transitionToGuild)) {
				if (typeof transitionToGuild[key] !== "function") continue;
				hiddenChannelUnpatches.push(
					instead(key, transitionToGuild, (args, original) => {
						if (typeof args[0] === "string") {
							const pathMatch = args[0].match(/(\d+)$/);
							if (pathMatch?.[1]) {
								const channel = getChannel?.(pathMatch[1]);
								if (channel && isHidden(channel)) {
									if (storage.showPopup) {
										showConfirmationAlert({
											title: "This channel is hidden.",
											content: React.createElement(AlertContent, { channel }),
											confirmText: "View Anyway",
											cancelText: "Cancel",
											onConfirm: () => original(...args),
										});
									} else {
										return original(...args);
									}
									return {};
								}
							}
						}
						return original(...args);
					}),
				);
			}
		} else {
			console.warn("[HiddenChannels] transitionToGuild not found.");
		}

		const ChannelInfo = findByName("ChannelInfo", false);
		if (ChannelInfo) {
			const lockIcon = getAssetIDByName("ic_lock");
			hiddenChannelUnpatches.push(
				after("default", ChannelInfo, (args, result) => {
					const channel = args[0]?.channel;
					const showLock = storage.showIcon && channel && isHidden(channel) && lockIcon;
					return React.createElement(
						React.Fragment,
						{},
						showLock
							? React.createElement(RN.Image, {
								source: lockIcon,
								style: { width: 20, height: 20, marginRight: 4 },
							})
							: null,
						result,
					);
				}),
			);
		}
	} catch (error) {
		console.error("[Sage Eyes] Could not update the hidden-channel feature.", error);
		for (const unpatch of hiddenChannelUnpatches.splice(0).reverse()) unpatch();
		restorePrivateChannelObfuscation();
		hiddenChannelFeatureEnabled = false;
		storage.enableHiddenChannels = false;
		showToast("Could not update hidden-channel feature");
	}
}

registerHiddenChannelFeatureToggle(setHiddenChannelFeatureEnabled);
registerMessageHistoryFeatureToggle(setMessageHistoryFeatureEnabled);

export default {
	onLoad: () => {
		storage.enableHiddenChannels ??= true;
		storage.enableMessageHistory ??= true;
		storage.enableServerInfo ??= true;
		storage.showIcon ??= true;
		storage.showPopup ??= true;
		storage.keepDeletedMessages ??= true;
		storage.keepEditHistory ??= true;
		storage.enableIgnoreUsers ??= true;
		storage.ignoreBotMessages ??= false;
		storage.ignoreOwnMessages ??= false;
		storage.timestampForEdits ??= false;
		if (storage.deletedIndicatorText === "This message is deleted") {
			storage.deletedIndicatorText = "This message was deleted";
		} else {
			storage.deletedIndicatorText ??= "This message was deleted";
		}
		if (!Array.isArray(storage.ignoredUserIds)) storage.ignoredUserIds = [];

		setMessageHistoryFeatureEnabled(Boolean(storage.enableMessageHistory));
		setHiddenChannelFeatureEnabled(Boolean(storage.enableHiddenChannels));
		setServerInfoFeatureEnabled(Boolean(storage.enableServerInfo));
	},
	onUnload: () => {
		setServerInfoFeatureEnabled(false);
		setHiddenChannelFeatureEnabled(false);
		setMessageHistoryFeatureEnabled(false);
		removeMessageHistoryPatch();
	},
	settings: Settings,
};
