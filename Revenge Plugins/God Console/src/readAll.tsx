import { registerCommand } from "@vendetta/commands";
import { findByProps, findByStoreName } from "../../compat";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";

let unregisterReadAllCommand: (() => void) | undefined;

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

export function setReadAllEnabled(value: boolean) {
	if (!value) {
		unregisterReadAllCommand?.();
		unregisterReadAllCommand = undefined;
		return;
	}
	if (unregisterReadAllCommand) return;
	try {
		unregisterReadAllCommand = registerCommand({
			name: "readall",
			displayName: "Read All",
			description: "Mark all unread server channels and direct messages as read.",
			options: [],
			execute: markAllRead,
		});
	} catch (error) {
		console.error("[God Console] Could not register /readall.", error);
		showToast("Could not register /readall. Check the console for details.", getAssetIDByName("Warning"));
	}
}