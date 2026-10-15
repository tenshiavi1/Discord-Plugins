import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { findByName, findByProps, findByStoreName } from "../../compat";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";

const actionSheet = findByProps("openLazy", "hideActionSheet");
const actionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
let patchedElements = new WeakSet<object>();
const unpatches: (() => void)[] = [];
let enabled = false;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let retryCount = 0;

function jumpToTop(channelId?: string, guildId?: string) {
	const channelStore = findByStoreName("ChannelStore");
	const selectedChannelStore = findByStoreName("SelectedChannelStore");
	const channel = channelId ? channelStore?.getChannel?.(channelId) : undefined;
	const targetChannelId = channel?.id ?? channelId ?? selectedChannelStore?.getChannelId?.();
	if (typeof targetChannelId !== "string") {
		showToast("Could not find the chat to jump to.");
		return;
	}

	const selectedId = selectedChannelStore?.getChannelId?.();
	const messageUtils = findByProps("jumpToMessage");
	if (targetChannelId === selectedId && typeof messageUtils?.jumpToMessage === "function") {
		messageUtils.jumpToMessage({
			channelId: targetChannelId,
			messageId: targetChannelId,
			flash: true,
			jumpType: "ANIMATED",
		});
		return;
	}

	const destinationGuildId = guildId ?? channel?.guild_id ?? "@me";
	const openUrl = findByProps("openUrl")?.openUrl;
	if (typeof openUrl === "function") {
		openUrl(`https://discord.com/channels/${destinationGuildId}/${targetChannelId}/${targetChannelId}`);
		return;
	}
	showToast("Discord's chat navigation is unavailable.");
}

function getJumpToPresentModule(): any | undefined {
	const findByFilePath = (globalThis as any).bunny?.metro?.findByFilePath;
	if (typeof findByFilePath === "function") {
		try {
			const module = findByFilePath("components_native/chat/JumpToPresentButton.tsx", false);
			if (module?.default) return module;
		} catch (error) {
			console.warn("[God Console] Could not locate the chat navigation button by file path.", error);
		}
	}
	const module = findByName("JumpToPresentButton", false);
	return module?.default ? module : undefined;
}

function installChatButton(): boolean {
	const module = getJumpToPresentModule();
	if (!module || typeof module.default !== "function") return false;
	unpatches.push(after("default", module, ([props]: any[], rendered: any) => {
		if (!enabled || !rendered || typeof rendered !== "object" || patchedElements.has(rendered)) return rendered;
		const presentButton = rendered.props?.children;
		if (!presentButton || typeof presentButton !== "object" || !presentButton.props) return rendered;
		const channelId = props?.channelId;
		const channel = channelId ? findByStoreName("ChannelStore")?.getChannel?.(channelId) : undefined;
		const topButton = React.createElement(
			RN.View,
			{ style: { transform: [{ scaleY: -1 }] } },
			React.cloneElement(presentButton, {
				...presentButton.props,
				accessibilityLabel: "Jump to top of chat",
				onPress: () => jumpToTop(channelId, channel?.guild_id),
			}),
		);
		patchedElements.add(rendered);
		return React.cloneElement(rendered, {
			...rendered.props,
			children: React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center" } }, topButton, presentButton),
		});
	}));
	return true;
}

function getActionRows(tree: any): any[] | undefined {
	const groups = findInReactTree(tree, (node: any) =>
		Array.isArray(node) && node[0]?.type?.name === "ActionSheetRowGroup",
	) as any[] | undefined;
	if (!groups) return undefined;
	return findInReactTree(groups, (node: any) =>
		Array.isArray(node) && node.some((child: any) => child?.type?.name === "ActionSheetRow"),
	) as any[] | undefined;
}

function installMessageMenu() {
	if (!actionSheet?.openLazy || !actionSheetRow) return;
	unpatches.push(before("openLazy", actionSheet, ([component, actionName, sheetProps]: any[]) => {
		if (!enabled || actionName !== "MessageLongPressActionSheet" || !sheetProps?.message) return;
		const message = sheetProps.message;
		const channelId = message.channel_id ?? message.channelId;
		if (typeof channelId !== "string") return;
		if (!component || typeof component.then !== "function") return;

		void component.then((module: any) => {
			if (!enabled || !module?.default) return;
			const unpatch = after("default", module, (_args: any[], rendered: any) => {
				React.useEffect(() => () => {
					unpatch();
					const index = unpatches.indexOf(unpatch);
					if (index >= 0) unpatches.splice(index, 1);
				}, []);
				if (!enabled) return rendered;
				const rows = getActionRows(rendered);
				if (!rows || rows.some((row) => row?.props?.godConsoleJumpToTop)) return rendered;
				const arrowIcon = getAssetIDByName("ArrowLargeDownIcon");
				rows.unshift(React.createElement(actionSheetRow, {
					key: `god-console-jump-${channelId}`,
					label: "Jump To Top",
					godConsoleJumpToTop: true,
					icon: actionSheetRow.Icon && arrowIcon
						? React.createElement(actionSheetRow.Icon, { source: arrowIcon })
						: undefined,
					onPress: () => {
						actionSheet.hideActionSheet();
						jumpToTop(channelId, message.guild_id ?? message.guildId);
					},
				}));
				return rendered;
			});
			unpatches.push(unpatch);
		}).catch((error: unknown) => {
			console.error("[God Console] Could not open the Jump To Top action.", error);
		});
	}));
}

function removePatches() {
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = undefined;
	for (const unpatch of unpatches.splice(0).reverse()) {
		try {
			unpatch();
		} catch (error) {
			console.warn("[God Console] Could not remove a Jump To Top patch.", error);
		}
	}
	patchedElements = new WeakSet<object>();
}

export function setJumpToTopEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	removePatches();
	if (!enabled) return;
	installMessageMenu();
	if (installChatButton()) return;
	
	retryCount = 0;
	retryTimer = setInterval(() => {
		retryCount++;
		if (installChatButton() || retryCount >= 30) {
			if (retryTimer) clearInterval(retryTimer);
			retryTimer = undefined;
		}
	}, 1000);
}