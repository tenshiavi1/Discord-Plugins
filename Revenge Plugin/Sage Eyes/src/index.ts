import { find, findByProps, findByName } from "@vendetta/metro";
import { constants, React, ReactNative as RN } from "@vendetta/metro/common";
import HiddenChannel from "./HiddenChannel";
import AlertContent from "./AlertContent";
import { Settings } from "./settings";
import { getAssetByID, getAssetByName, getAssetIDByName } from "@vendetta/ui/assets";

import { after, instead } from "@vendetta/patcher";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { settings } from "@vendetta";
import { storage } from "@vendetta/plugin";

const Permissions = findByProps("getChannelPermissions", "can");
// const Router = findByProps("transitionToGuild");
// const Fetcher = findByProps("stores", "fetchMessages");
const { ChannelTypes } = findByProps("ChannelTypes");
const { getChannel } = findByProps("getChannel") || findByName("getChannel", false);
const snowFlakeTimestamp = findByProps("extractTimestamp");

const skipChannels = [ChannelTypes.DM, ChannelTypes.GROUP_DM, ChannelTypes.GUILD_CATEGORY];



function isHidden(channel: any | undefined) {
	if (channel === undefined) return false;
	if (typeof channel === "string") channel = getChannel(channel);
	if (!channel || skipChannels.includes(channel.type)) return false;
	channel.realCheck = true;
	const res = !Permissions.can(constants.Permissions.VIEW_CHANNEL, channel);
	delete channel.realCheck;
	return res;
}

// console.log("Loaded Hidden Channels plugin");

const unpatches: (() => void)[] = [];

const privateChannelHidingMarker = "2026-02-private-channel-hiding";
const privateChannelHidingFlags = ["enableObfuscation", "enableIntegrityCheck"];

function disablePrivateChannelObfuscation(value: any, depth = 0, seen = new Set<any>()) {
	if (value === null || typeof value !== "object" || depth > 4 || seen.has(value)) return value;
	seen.add(value);

	for (const flag of privateChannelHidingFlags) {
		try {
			if (value[flag] === true) value[flag] = false;
		} catch {}
	}

	for (const child of Object.values(value)) {
		disablePrivateChannelObfuscation(child, depth + 1, seen);
	}

	return value;
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
		for (const [method, value] of Object.entries(sourceModule)) {
			if (typeof value !== "function") continue;
			const source = Function.prototype.toString.call(value);
			if (!source.includes(privateChannelHidingMarker) && !privateChannelHidingFlags.every((flag) => source.includes(flag))) continue;

			unpatches.push(instead(method, sourceModule, (args, original) => {
				const result = original(...args.map((arg) => disablePrivateChannelObfuscation(arg)));
				if (result && typeof result.then === "function") {
					return result.then((resolved: any) => disablePrivateChannelObfuscation(resolved));
				}
				return disablePrivateChannelObfuscation(result);
			}));
			patchedMethods++;
		}
	}

	const guildChannelStore = findByProps("isChannelGated");
	if (typeof guildChannelStore?.isChannelGated === "function") {
		unpatches.push(after("isChannelGated", guildChannelStore, () => false));
	}

	if (!flagModule && !patchedMethods) {
		console.warn("[Sage Eyes] Discord's private-channel name protection module was not found.");
	}
}

export default {
	onLoad: () => {
		storage.showIcon ??= true;
		storage.showPopup ??= true;
		patchPrivateChannelObfuscation();

		unpatches.push(
			after("can", Permissions, ([permID, channel], res) => {
				// console.log("[HiddenChannels] Permissions.can called " + (!channel?.realCheck && permID === constants.Permissions.VIEW_CHANNEL));
				if (!channel?.realCheck && permID === constants.Permissions.VIEW_CHANNEL) return true;
				return res;
			})
		);

		// unpatches.push(
		// 	instead("transitionToGuild", Router, (args, orig) => {
		// 		console.log("[HiddenChannels] Router.transitionToGuild called with args:", args);
		// 		const [_, channel] = args;
		// 		if (!isHidden(channel) && typeof orig === "function") orig(args);
		// 	})
		// );

		// unpatches.push(
		// 	instead("fetchMessages", Fetcher, (args, orig) => {
		// 		console.log("[HiddenChannels] Fetcher.fetchMessages called with args:", args);
		// 		const [channel] = args;
		// 		if (!isHidden(channel) && typeof orig === "function") orig(args);
		// 	})
		// );

		// unpatches.push(
		// 	instead("default", ChannelMessages, (args, orig) => {
		// 		console.log("[HiddenChannels] ChannelMessages.default called with args:", args);
		// 		const channel = args[0]?.channel;
		// 		console.log("[HiddenChannels] ChannelMessages.default called with:", channel, "isHidden:", isHidden(channel));
		// 		if (!isHidden(channel) && typeof orig === "function") return orig(...args);
		// 		else return React.createElement(HiddenChannel, { channel });
		// 	})
		// );

		// const Components = [
		// 	"transitionToGuild",
		// 	// "fetchMessages",
		// 	// "Channel",
		// 	// "Messages",
		// 	// "getChannel",
		// 	// "ChannelTypes",
		// 	// "ChannelMessages", // Not working for some reason
		// 	// "ChannelContainer",
		// ];

		const transitionToGuild = findByProps("transitionToGuild");
		if (transitionToGuild) {
			for (const key of Object.keys(transitionToGuild)) {
				// Yes, all of them need to be patched. No, I don't know why. The key that's actually responsible is 'forward'
				if (typeof transitionToGuild[key] === "function") {
					unpatches.push(
						instead(key, transitionToGuild, (args, orig) => {
							if (typeof args[0] === "string") {
								const pathMatch = args[0].match(/(\d+)$/);
								if (pathMatch?.[1]) {
									const channelId = pathMatch[1];
									const channel = getChannel(channelId);
									if (channel && isHidden(channel)) {
                                        // console.log(key.toString())
										if (storage.showPopup) {
	                                        showConfirmationAlert({
	                                            title: "This channel is hidden.",
	                                            content: React.createElement(AlertContent, { channel }),
	                                            confirmText: "View Anyway",
	                                            cancelText: "Cancel",
	                                            onConfirm: () => { return orig(...args); },
	                                        });
										} else { return orig(...args); }
                                        return {};
									}
								}
							}
							return orig(...args);
						})
					);
				}
			}
		} else {
			console.warn("[HiddenChannels] transitionToGuild not found.");
		}

		const ChannelInfo = findByName("ChannelInfo", false);
		if (ChannelInfo && storage.showIcon) {
			unpatches.push(
				after("default", ChannelInfo, ([{ channel }], ret) =>
					React.createElement(
						React.Fragment,
						{},
						channel && isHidden(channel)
							? React.createElement(
								RN.Image,
								{
									source: getAssetByName("ic_lock").id,
									style: { width: 20, height: 20, marginRight: 4 },
								}
							)
							: null,
						ret,
					)
				)
			);
		}

	},
	onUnload: () => {
		for (const unpatch of unpatches.splice(0)) unpatch();
	},
	settings: Settings,
};
