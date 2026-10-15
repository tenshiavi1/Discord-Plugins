import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { find, findByProps, findByStoreName } from "../../compat";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";

type PatchedLayout = {
	target: any;
	originalFooterSize: (...args: any[]) => any;
	originalRenderFooter: (...args: any[]) => any;
	wrappedFooterSize: (...args: any[]) => any;
	wrappedRenderFooter: (...args: any[]) => any;
};

const hookUnpatches: (() => void)[] = [];
const patchedModules = new Set<object>();
const patchedLayouts = new Map<any, PatchedLayout>();
let enabled = false;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let retryCount = 0;

function collectUnreadChannels(): { channelId: string; messageId: string | null; readStateType: number }[] {
	const guildStore = findByStoreName("GuildStore");
	const channelStore = findByStoreName("GuildChannelStore", "ChannelStore");
	const privateChannelStore = findByStoreName("ChannelStore");
	const readStateStore = findByStoreName("ReadStateStore") ?? findByProps("hasUnread", "lastMessageId");
	if (typeof readStateStore?.hasUnread !== "function") return [];

	const channels = new Map<string, { channelId: string; messageId: string | null; readStateType: number }>();
	const addIfUnread = (candidate: any) => {
		const channel = candidate?.channel ?? candidate;
		if (typeof channel?.id !== "string" || !readStateStore.hasUnread(channel.id)) return;
		channels.set(channel.id, {
			channelId: channel.id,
			messageId: readStateStore.lastMessageId?.(channel.id) ?? null,
			readStateType: 0,
		});
	};

	try {
		const guilds = guildStore?.getGuilds?.() ?? {};
		for (const guild of Object.values(guilds) as any[]) {
			if (typeof guild?.id !== "string") continue;
			const groups = channelStore?.getChannels?.(guild.id);
			for (const kind of ["SELECTABLE", "VOCAL"]) {
				for (const channel of groups?.[kind] ?? []) addIfUnread(channel);
			}
		}
	} catch (error) {
		console.warn("[God Console] Could not inspect server unread channels.", error);
	}

	try {
		const privateChannels = privateChannelStore?.getPrivateChannels?.() ?? {};
		for (const channel of Object.values(privateChannels) as any[]) addIfUnread(channel);
	} catch (error) {
		console.warn("[God Console] Could not inspect unread direct messages.", error);
	}

	return [...channels.values()];
}

function markAllRead() {
	const dispatcher = findByProps("dispatch", "subscribe") ?? findByStoreName("Dispatcher");
	if (typeof dispatcher?.dispatch !== "function") {
		showToast("Discord's read-state dispatcher is unavailable.");
		return;
	}

	try {
		const channels = collectUnreadChannels();
		if (channels.length === 0) {
			showToast("There are no unread channels to mark as read.");
			return;
		}
		dispatcher.dispatch({ type: "BULK_ACK", context: "APP", channels });
		showToast(`Marked ${channels.length} channel${channels.length === 1 ? "" : "s"} as read.`, getAssetIDByName("Check"));
	} catch (error) {
		console.error("[God Console] Could not mark channels as read.", error);
		showToast("Could not mark channels as read.");
	}
}

function ReadAllButton() {
	const icon = getAssetIDByName("ic_check") ?? getAssetIDByName("Check");
	return (
		<RN.View style={{ alignSelf: "stretch", alignItems: "center", paddingVertical: 4 }}>
			<RN.TouchableOpacity
				accessibilityRole="button"
				accessibilityLabel="Mark all unread channels as read"
				onPress={markAllRead}
				style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center" }}
			>
				{icon ? <RN.Image source={icon} style={{ width: 24, height: 24, tintColor: "#dbdee1" }} /> : (
					<RN.Text style={{ color: "#dbdee1", fontSize: 20, fontWeight: "700" }}>✓</RN.Text>
				)}
			</RN.TouchableOpacity>
		</RN.View>
	);
}

function patchLayout(layout: any) {
	if (!layout || typeof layout !== "object" || patchedLayouts.has(layout)) return;
	if (typeof layout.footerSize !== "function" || typeof layout.renderFooter !== "function") return;

	const originalFooterSize = layout.footerSize;
	const originalRenderFooter = layout.renderFooter;
	const wrappedFooterSize = function (this: any, ...args: any[]) {
		return originalFooterSize.apply(this, args) + 56;
	};
	const wrappedRenderFooter = function (this: any, ...args: any[]) {
		return React.createElement(
			RN.View,
			{ style: { alignSelf: "stretch" }, collapsable: false },
			originalRenderFooter.apply(this, args),
			React.createElement(ReadAllButton),
		);
	};

	layout.footerSize = wrappedFooterSize;
	layout.renderFooter = wrappedRenderFooter;
	patchedLayouts.set(layout, { target: layout, originalFooterSize, originalRenderFooter, wrappedFooterSize, wrappedRenderFooter });
}

function findGuildBarHook(): any | undefined {
	const moduleRegistry = (globalThis as any).modules;
	if (moduleRegistry && typeof moduleRegistry === "object") {
		for (const definition of Object.values(moduleRegistry) as any[]) {
			const exports = definition?.publicModule?.exports;
			if (typeof exports?.default === "function" && exports.default.name === "useGuildsBarProps") return exports;
		}
	}

	const result = find((candidate: any) => {
		const exports = candidate?.default ?? candidate;
		return typeof exports?.default === "function" && exports.default.name === "useGuildsBarProps";
	});
	return result?.publicModule?.exports ?? result;
}

function installPatch(): boolean {
	const module = findGuildBarHook();
	if (!module || typeof module.default !== "function" || patchedModules.has(module)) return false;
	patchedModules.add(module);
	hookUnpatches.push(after("default", module, (_args: any[], result: any) => {
		if (enabled) patchLayout(result?.listDataProps);
		return result;
	}));
	return true;
}

function restoreLayouts() {
	for (const [layout, patch] of patchedLayouts) {
		if (layout.footerSize === patch.wrappedFooterSize) layout.footerSize = patch.originalFooterSize;
		if (layout.renderFooter === patch.wrappedRenderFooter) layout.renderFooter = patch.originalRenderFooter;
	}
	patchedLayouts.clear();
}

export function setReadAllEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (retryTimer) clearInterval(retryTimer);
	retryTimer = undefined;
	retryCount = 0;

	if (!enabled) {
		for (const unpatch of hookUnpatches.splice(0).reverse()) unpatch();
		patchedModules.clear();
		restoreLayouts();
		return;
	}

	if (installPatch()) return;
	retryTimer = setInterval(() => {
		retryCount++;
		if (installPatch() || retryCount >= 30) {
			if (retryTimer) clearInterval(retryTimer);
			retryTimer = undefined;
		}
	}, 1000);
}