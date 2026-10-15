import { find, findByProps, findByStoreName } from "@vendetta/metro";
import { clipboard, React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

const guildStore = findByStoreName("GuildStore");
const guildMemberStore = findByStoreName("GuildMemberStore");
const guildRoleStore = findByStoreName("GuildRoleStore");
const guildChannelStore = findByStoreName("GuildChannelStore");
const userStore = findByStoreName("UserStore");
const guildHeaderCountsStore = findByStoreName("GuildHeaderCountsStore");
const memberCountStore = findByProps("getMemberCount", "getOnlineCount");
const actionSheet = findByProps("openLazy", "hideActionSheet");
const ActionSheet = findByProps("ActionSheet")?.ActionSheet ?? RN.View;
const ActionSheetCloseButton = findByProps("ActionSheetCloseButton")?.ActionSheetCloseButton;
const unpatches: (() => void)[] = [];
let serverInfoEnabled = false;

type GuildRecord = {
	name?: string;
	ownerId?: string;
	owner_id?: string;
	description?: string;
	memberCount?: number;
	approximateMemberCount?: number;
	premiumTier?: number;
	premiumSubscriptionCount?: number;
	vanityURLCode?: string;
	vanity_url_code?: string;
};

function formatCount(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

function getCreatedDate(guildId: string) {
	const timestamp = Math.floor(Number(guildId) / 4_194_304) + 1_420_070_400_000;
	return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleDateString() : "—";
}

function InfoRow({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
	return (
		<RN.TouchableOpacity
			disabled={!onPress}
			onPress={onPress}
			style={{
				paddingVertical: 10,
				paddingHorizontal: 16,
				borderBottomWidth: 0.5,
				borderBottomColor: "#3f4147",
			}}
		>
			<RN.Text style={{ color: "#b5bac1", fontSize: 13 }}>{label}</RN.Text>
			<RN.Text selectable style={{ color: "#f2f3f5", fontSize: 16, marginTop: 3 }}>
				{value}
			</RN.Text>
		</RN.TouchableOpacity>
	);
}

function ServerInfoSheet({ guildId }: { guildId: string }) {
	const guild = guildStore?.getGuild?.(guildId) as GuildRecord | undefined;
	const ownerId = guild?.ownerId ?? guild?.owner_id;
	const owner = ownerId ? userStore?.getUser?.(ownerId) : undefined;
	const member = ownerId ? guildMemberStore?.getMember?.(guildId, ownerId) : undefined;
	const ownerName = member?.nick ?? owner?.globalName ?? owner?.username ?? ownerId ?? "—";
	const memberCount =
		memberCountStore?.getMemberCount?.(guildId) ??
		guild?.memberCount ??
		guild?.approximateMemberCount;
	const onlineCount =
		guildHeaderCountsStore?.getOnlineCount?.(guildId) ??
		memberCountStore?.getOnlineCount?.(guildId);
	const roleCount = guildRoleStore?.getSortedRoles?.(guildId)?.length;
	const channels = guildChannelStore?.getChannels?.(guildId);
	const channelCount = channels && typeof channels === "object" ? Object.keys(channels).length : undefined;
	const boostTier = guild?.premiumTier;
	const boostCount = guild?.premiumSubscriptionCount;

	const copyGuildId = () => {
		try {
			clipboard.setString(guildId);
			actionSheet?.hideActionSheet?.();
			showToast("Server ID copied");
		} catch (error) {
			console.error("[Sage Eyes] Could not copy the server ID.", error);
			showToast("Could not copy server ID");
		}
	};

	return (
		<ActionSheet style={{ flex: 1, backgroundColor: "#2b2d31" }}>
			<RN.View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
				<RN.Text style={{ color: "#f2f3f5", fontSize: 20, fontWeight: "700", flex: 1 }}>
					Server Information
				</RN.Text>
				{ActionSheetCloseButton
					? <ActionSheetCloseButton onPress={() => actionSheet?.hideActionSheet?.()} />
					: (
						<RN.Text
							onPress={() => actionSheet?.hideActionSheet?.()}
							style={{ color: "#b5bac1", fontSize: 16 }}
						>
							Close
						</RN.Text>
					)}
			</RN.View>
			<RN.ScrollView>
				<RN.View style={{ padding: 16 }}>
					<RN.Text style={{ color: "#f2f3f5", fontSize: 22, fontWeight: "700" }}>
						{guild?.name ?? "Server"}
					</RN.Text>
					{guild?.description
						? <RN.Text style={{ color: "#b5bac1", fontSize: 14, marginTop: 8 }}>{guild.description}</RN.Text>
						: null}
				</RN.View>
				<InfoRow label="Members" value={formatCount(memberCount)} />
				<InfoRow label="Online" value={formatCount(onlineCount)} />
				{roleCount !== undefined ? <InfoRow label="Roles" value={formatCount(roleCount)} /> : null}
				{channelCount !== undefined ? <InfoRow label="Channels" value={formatCount(channelCount)} /> : null}
				{boostTier !== undefined
					? <InfoRow label="Boost Status" value={`Level ${boostTier} (${formatCount(boostCount)} boosts)`} />
					: null}
				{ownerId ? <InfoRow label="Owner" value={`${ownerName} (${ownerId})`} /> : null}
				{guild?.vanityURLCode || guild?.vanity_url_code
					? <InfoRow label="Vanity URL" value={`discord.gg/${guild.vanityURLCode ?? guild.vanity_url_code}`} />
					: null}
				<InfoRow label="Created On" value={getCreatedDate(guildId)} />
				<InfoRow label="Server ID · Tap to Copy" value={guildId} onPress={copyGuildId} />
			</RN.ScrollView>
		</ActionSheet>
	);
}

function openServerInfo(guildId: string) {
	if (typeof actionSheet?.openLazy !== "function") {
		console.error("[Sage Eyes] Discord's action-sheet API is unavailable; server information cannot be opened.");
		showToast("Server information is unavailable");
		return;
	}

	actionSheet.openLazy(
		Promise.resolve({ default: ServerInfoSheet }),
		`sage-eyes-server-info-${guildId}`,
		{ guildId },
	);
}

function installServerInfoMenuPatch() {
	const menuModule = find((candidate: any) =>
		candidate?.default?.name === "getGuildsBarGuildMenuItems",
	);
	if (!menuModule) {
		console.warn("[Sage Eyes] Server-list context menu was not found; Server Info is unavailable.");
		return;
	}

	unpatches.push(after("default", menuModule, (args, result) => {
		if (!serverInfoEnabled || !Array.isArray(result)) return result;
		const guildId = args[0];
		if (typeof guildId !== "string" || !guildId) return result;
		if (result.some((item: any) => item?.sageEyesServerInfoAction)) return result;
		const infoIcon = getAssetIDByName("ic_information_24px");

		return [
			...result,
			{
				iconSource: infoIcon,
				label: "Server Info",
				sageEyesServerInfoAction: true,
				action: () => openServerInfo(guildId),
			},
		];
	}));
}

export function setServerInfoFeatureEnabled(enabled: boolean) {
	if (enabled === serverInfoEnabled) return;
	serverInfoEnabled = enabled;

	if (!enabled) {
		for (const unpatch of unpatches.splice(0).reverse()) unpatch();
		return;
	}

	try {
		installServerInfoMenuPatch();
	} catch (error) {
		console.error("[Sage Eyes] Could not enable Server Info.", error);
		for (const unpatch of unpatches.splice(0).reverse()) unpatch();
		serverInfoEnabled = false;
		showToast("Could not enable Server Info");
	}
}
