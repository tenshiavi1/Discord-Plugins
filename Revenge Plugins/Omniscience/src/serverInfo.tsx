import { find, findByProps, findByStoreName } from "../../compat";
import { clipboard, React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";
import { countGroupedChannels } from "./serverInfoCounts";

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
	icon?: string | null;
	banner?: string | null;
	bannerColor?: string | number | null;
	banner_color?: string | null;
	accentColor?: number | null;
	accent_color?: number | null;
	memberCount?: number;
	approximateMemberCount?: number;
	premiumTier?: number;
	premiumSubscriptionCount?: number;
	vanityURLCode?: string;
	vanity_url_code?: string;
};

function getGuildAssetUrl(guildId: string, hash: string, asset: "icons" | "banners", size: number) {
	const extension = hash.startsWith("a_") ? "gif" : "png";
	return `https://cdn.discordapp.com/${asset}/${guildId}/${hash}.${extension}?size=${size}`;
}

function getDefaultAvatarIndex(guildId: string) {
	return [...guildId].reduce((remainder, digit) => (remainder * 10 + Number(digit)) % 6, 0);
}

function getBannerColor(guild?: GuildRecord) {
	const color = guild?.bannerColor ?? guild?.banner_color ?? guild?.accentColor ?? guild?.accent_color;
	if (typeof color === "number" && Number.isFinite(color)) {
		return `#${Math.max(0, color).toString(16).padStart(6, "0").slice(-6)}`;
	}
	if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color)) {
		return color.startsWith("#") ? color : `#${color}`;
	}
	return "#2b2d31";
}

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
	const [bannerFailed, setBannerFailed] = React.useState(false);
	const [iconFailed, setIconFailed] = React.useState(false);
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
	const channelCount = countGroupedChannels(channels);
	const boostTier = guild?.premiumTier;
	const boostCount = guild?.premiumSubscriptionCount;
	const bannerColor = getBannerColor(guild);
	const guildIcon = guild?.icon
		? getGuildAssetUrl(guildId, guild.icon, "icons", 256)
		: `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(guildId)}.png`;

	const copyGuildId = () => {
		try {
			clipboard.setString(guildId);
			actionSheet?.hideActionSheet?.();
			showToast("Copied the server ID to your clipboard.");
		} catch (error) {
			console.error("[Omniscience] Could not copy the server ID.", error);
			showToast("Could not copy the server ID to your clipboard.");
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
				<RN.View style={{ height: 158, marginHorizontal: 16, marginTop: 8, marginBottom: 12 }}>
					<RN.View style={{ height: 128, borderRadius: 8, backgroundColor: bannerColor, overflow: "hidden" }}>
						{guild?.banner && !bannerFailed
							? (
								<RN.Image
									source={{ uri: getGuildAssetUrl(guildId, guild.banner, "banners", 1024) }}
									onError={() => setBannerFailed(true)}
									resizeMode="cover"
									style={{ width: "100%", height: "100%" }}
								/>
							)
							: null}
					</RN.View>
					<RN.View
						style={{
							position: "absolute",
							left: 16,
							bottom: 0,
							width: 76,
							height: 76,
							borderRadius: 38,
							borderWidth: 4,
							borderColor: "#2b2d31",
							backgroundColor: bannerColor,
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
						}}
					>
						{!iconFailed
							? (
								<RN.Image
									source={{ uri: guildIcon }}
									onError={() => setIconFailed(true)}
									resizeMode="cover"
									style={{ width: "100%", height: "100%" }}
								/>
							)
							: (
								<RN.Text style={{ color: "#f2f3f5", fontSize: 28, fontWeight: "700" }}>
									{guild?.name?.slice(0, 1) ?? "?"}
								</RN.Text>
							)}
					</RN.View>
				</RN.View>
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
		console.error("[Omniscience] Discord's action-sheet API is unavailable; server information cannot be opened.");
		showToast("Could not open server information because Discord's action sheet is unavailable.");
		return;
	}

	actionSheet.openLazy(
		Promise.resolve({ default: ServerInfoSheet }),
		`omniscience-server-info-${guildId}`,
		{ guildId },
	);
}

function installServerInfoMenuPatch() {
	const menuModule = find((candidate: any) =>
		candidate?.default?.name === "getGuildsBarGuildMenuItems",
	);
	if (!menuModule) {
		console.warn("[Omniscience] Server-list context menu was not found; Server Info is unavailable.");
		return;
	}

	unpatches.push(after("default", menuModule, (args, result) => {
		if (!serverInfoEnabled || !Array.isArray(result)) return result;
		const guildId = args[0];
		if (typeof guildId !== "string" || !guildId) return result;
		if (result.some((item: any) => item?.omniscienceServerInfoAction)) return result;
		const infoIcon = getAssetIDByName("ic_information_24px");

		return [
			...result,
			{
				iconSource: infoIcon,
				label: "Server Info",
				omniscienceServerInfoAction: true,
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
		console.error("[Omniscience] Could not enable Server Info.", error);
		for (const unpatch of unpatches.splice(0).reverse()) unpatch();
		serverInfoEnabled = false;
		showToast("Could not enable Server Info. Check the console for details.");
	}
}
