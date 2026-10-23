import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findByProps } from "../../compat";
import { SmoothPreviewSwap } from "./previewMotion";
import { DeviceBadges, updateDeviceIndicatorOptions } from "./deviceIndicators";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, TableSwitchRow, Stack } = findByProps(
	"TableSwitchRow",
	"TableRowGroup",
	"Stack",
	"TableRow",
);
const { Text } = findByProps("Text", "View");
const Press = RN.Pressable || RN.TouchableOpacity;
const SCREENS: [string, string][] = [["dm", "DM"], ["members", "Members"], ["profile", "Profile"]];
const DEMOS: Record<string, string>[] = [
	{ desktop: "online", mobile: "idle" },
	{ mobile: "online" },
	{ desktop: "dnd", web: "dnd" },
	{ embedded: "online", desktop: "idle" },
];

function Icon({ name, fallback, color = "#b5bac1" }: { name: string; fallback: string; color?: string }) {
	const asset = getAssetIDByName(name);
	return asset
		? <RN.Image source={asset} style={{ width: 18, height: 18, tintColor: color }} />
		: <Text style={{ color, fontSize: 18, fontWeight: "600" }}>{fallback}</Text>;
}

function PreviewSegment({ value, options, onChange }: {
	value: string;
	options: [string, string][];
	onChange: (value: string) => void;
}) {
	return (
		<RN.View style={{ flexDirection: "row", padding: 3, gap: 3, borderRadius: 16, backgroundColor: "#1e1f22" }}>
			{options.map(([key, label]) => (
				<Press
					key={key}
					accessibilityRole="button"
					accessibilityState={{ selected: value === key }}
					onPress={() => onChange(key)}
					style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 13, backgroundColor: value === key ? "#4e5058" : "transparent" }}
				>
					<Text style={{ color: value === key ? "#ffffff" : "#949ba4", fontSize: 12, fontWeight: "600" }}>{label}</Text>
				</Press>
			))}
		</RN.View>
	);
}

function PreviewHeader({ title, user, clients, options }: { title: string; user: string; clients: Record<string, string>; options: Record<string, boolean> }) {
	const mobileOnly = Object.keys(clients).length === 1 && Boolean(clients.mobile);
	const color = Object.values(clients).includes("idle") ? "#f0b232" : Object.values(clients).includes("dnd") ? "#f23f43" : "#23a55a";
	return (
		<RN.View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#ffffff14" }}>
			<Text style={{ color: "#b5bac1", fontSize: 24 }}>‹</Text>
			<RN.View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
				<RN.View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#3ba55c" }}>
					<Text style={{ color: "#ffffff", fontWeight: "700" }}>{user.slice(0, 1)}</Text>
				</RN.View>
				<Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "700" }}>{title}</Text>
				{options.dmHeader ? <DeviceBadges clients={clients} /> : null}
				<RN.View style={{ position: "absolute", left: 24, top: 24, minWidth: 10, height: 10, paddingHorizontal: mobileOnly && !options.hideMobileBadge ? 2 : 0, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1e" }}>
					<RN.View style={{ width: mobileOnly && !options.hideMobileBadge ? 5 : 7, height: mobileOnly && !options.hideMobileBadge ? 8 : 7, borderRadius: mobileOnly && !options.hideMobileBadge ? 2 : 4, backgroundColor: color }} />
				</RN.View>
			</RN.View>
			<Icon name="PhoneCallIcon" fallback="☎" />
			<Icon name="MagnifyingGlassIcon" fallback="⌕" />
		</RN.View>
	);
}

function PreviewAvatar({ letter, color, clients, hideMobile }: { letter: string; color: string; clients: Record<string, string>; hideMobile: boolean }) {
	const statuses = Object.values(clients);
	const status = statuses.includes("dnd") ? "#f23f43" : statuses.includes("idle") ? "#f0b232" : "#23a55a";
	const mobileOnly = Object.keys(clients).length === 1 && Boolean(clients.mobile);
	return (
		<RN.View style={{ width: 40, height: 40 }}>
			<RN.View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: color }}>
				<Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "700" }}>{letter}</Text>
			</RN.View>
			<RN.View style={{ position: "absolute", right: -2, bottom: -2, width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1e" }}>
				<RN.View style={{ width: mobileOnly && !hideMobile ? 6 : 9, height: mobileOnly && !hideMobile ? 11 : 9, borderRadius: mobileOnly && !hideMobile ? 2 : 5, backgroundColor: status }} />
			</RN.View>
		</RN.View>
	);
}

function PersonRow({ name, color, clients, hideMobile, showDevices }: { name: string; color: string; clients: Record<string, string>; hideMobile: boolean; showDevices: boolean }) {
	return (
		<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 7 }}>
			<PreviewAvatar letter={name.slice(0, 1)} color={color} clients={clients} hideMobile={hideMobile} />
			<RN.View style={{ flex: 1 }}>
				<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
					<Text style={{ color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}>{name}</Text>
					{showDevices ? <DeviceBadges clients={clients} /> : null}
				</RN.View>
				<Text style={{ color: "#949ba4", fontSize: 12 }}>Online</Text>
			</RN.View>
		</RN.View>
	);
}

function DevicePreview({ enabled, options }: { enabled: boolean; options: Record<string, boolean> }) {
	const [screen, setScreen] = React.useState("dm");
	const [demo, setDemo] = React.useState(0);
	const clients = DEMOS[demo % DEMOS.length];
	const colors = ["#3ba55c", "#eb459e", "#faa61a"];
	const screenContent = screen === "dm" ? (
		<RN.View style={{ paddingVertical: 8 }}>
			<RN.View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
				<PreviewAvatar letter="A" color={colors[0]} clients={{ desktop: "online" }} hideMobile={false} />
				<RN.View style={{ flex: 1 }}><Text style={{ color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}>Alex</Text><Text style={{ color: "#dbdee1", fontSize: 14 }}>Are you coming to the game tonight?</Text></RN.View>
			</RN.View>
			<RN.View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingVertical: 6 }}>
				<PreviewAvatar letter="Y" color="#5865f2" clients={{ mobile: "online" }} hideMobile={false} />
				<RN.View style={{ flex: 1 }}><Text style={{ color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}>You</Text><Text style={{ color: "#dbdee1", fontSize: 14 }}>Yes, see you there!</Text></RN.View>
			</RN.View>
		</RN.View>
	) : screen === "members" ? (
		<RN.View style={{ paddingVertical: 6 }}>
			<Text style={{ color: "#949ba4", fontSize: 12, fontWeight: "700", paddingHorizontal: 14, paddingBottom: 4 }}>ONLINE — 3</Text>
			<PersonRow name="Alex" color={colors[0]} clients={clients} hideMobile={enabled && options.hideMobileBadge} showDevices={enabled && options.lists} />
			<PersonRow name="Sam" color={colors[1]} clients={{ desktop: "online" }} hideMobile={enabled && options.hideMobileBadge} showDevices={enabled && options.lists} />
			<PersonRow name="Riley" color={colors[2]} clients={{ mobile: "online" }} hideMobile={enabled && options.hideMobileBadge} showDevices={enabled && options.lists} />
		</RN.View>
	) : (
		<RN.View>
			<RN.View style={{ height: 68, backgroundColor: "#2d7d46" }} />
			<RN.View style={{ paddingHorizontal: 16, marginTop: -42, paddingBottom: 14 }}>
				<RN.View style={{ alignSelf: "flex-start", padding: 5, borderRadius: 44, backgroundColor: "#1a1a1e" }}>
					<PreviewAvatar letter="A" color={colors[0]} clients={clients} hideMobile={enabled && options.hideMobileBadge} />
				</RN.View>
				<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
					<Text style={{ color: "#f2f3f5", fontSize: 20, fontWeight: "800" }}>Alex</Text>
					{enabled && options.profiles ? <DeviceBadges clients={clients} /> : null}
				</RN.View>
				<Text style={{ color: "#949ba4", fontSize: 13, fontWeight: "600" }}>alex</Text>
			</RN.View>
		</RN.View>
	);
	return (
		<RN.View style={{ gap: 8 }}>
			<RN.View style={{ overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: "#ffffff14", backgroundColor: "#1a1a1e" }}>
				<PreviewHeader title={screen === "dm" ? "Alex" : screen === "members" ? "general" : "Profile"} user="Alex" clients={clients} options={{ ...options, dmHeader: enabled && screen === "dm" && options.dmHeader, hideMobileBadge: enabled && options.hideMobileBadge }} />
				<SmoothPreviewSwap revision={`${enabled}:${screen}:${demo}:${options.dmHeader}:${options.lists}:${options.profiles}:${options.hideMobileBadge}`}>{screenContent}</SmoothPreviewSwap>
				<RN.View style={{ height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: "#ffffff0f" }}><Text style={{ color: "#949ba4", fontSize: 13 }}>Message #{screen === "dm" ? "@Alex" : "general"}</Text></RN.View>
			</RN.View>
			<RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
				<PreviewSegment value={screen} options={SCREENS} onChange={setScreen} />
				{enabled ? <Press accessibilityRole="button" accessibilityHint="Change Alex's devices" onPress={() => setDemo((value) => (value + 1) % DEMOS.length)} style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "#4e505899" }}>
					<Icon name="LaptopPhoneIcon" fallback="▯" />
					<Text style={{ color: "#f2f3f5", fontSize: 12, fontWeight: "600" }}>Change devices</Text>
				</Press> : null}
			</RN.View>
			<Text style={{ color: "#949ba4", fontSize: 12 }}>Alex is on: {Object.keys(clients).map((name) => `${name} (${clients[name]})`).join(", ")}</Text>
		</RN.View>
	);
}

export default function DeviceIndicatorSettings() {
	useProxy(storage);
	const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
	const enabled = storage.enabled !== false && storage.deviceIndicatorsEnabled === true;
	const options = {
		dmHeader: storage.deviceIndicatorDmHeader !== false,
		lists: storage.deviceIndicatorLists !== false,
		profiles: storage.deviceIndicatorProfiles !== false,
		hideMobileBadge: storage.deviceIndicatorHideMobileBadge !== false,
	};
	const update = (next: Record<string, boolean>) => {
		Object.assign(storage, next);
		updateDeviceIndicatorOptions({
			enabled: storage.enabled !== false && storage.deviceIndicatorsEnabled === true,
			dmHeader: storage.deviceIndicatorDmHeader !== false,
			lists: storage.deviceIndicatorLists !== false,
			profiles: storage.deviceIndicatorProfiles !== false,
			hideMobileBadge: storage.deviceIndicatorHideMobileBadge !== false,
		});
		forceUpdate();
	};

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Device Indiciator">
					<TableSwitchRow
						label="Enable device indicators"
						subLabel="Show which devices people are using next to their names."
						value={enabled}
						onValueChange={(value: boolean) => update({ deviceIndicatorsEnabled: value })}
					/>
				</TableRowGroup>
				<TableRowGroup title="Preview">
					<RN.View style={{ padding: 8 }}><DevicePreview enabled={enabled} options={options} /></RN.View>
				</TableRowGroup>
				<TableRowGroup title="Show icons">
					<TableSwitchRow disabled={!enabled} label="In DMs" subLabel="Next to the name at the top of a direct message." value={options.dmHeader} onValueChange={(value: boolean) => update({ deviceIndicatorDmHeader: value })} />
					<TableSwitchRow disabled={!enabled} label="In lists" subLabel="Member list, friends, DM list, and voice channels." value={options.lists} onValueChange={(value: boolean) => update({ deviceIndicatorLists: value })} />
					<TableSwitchRow disabled={!enabled} label="On profiles" subLabel="Next to the name on a profile." value={options.profiles} onValueChange={(value: boolean) => update({ deviceIndicatorProfiles: value })} />
				</TableRowGroup>
				<TableRowGroup title="Avatars">
					<TableSwitchRow disabled={!enabled} label="Hide the phone badge" subLabel="Use a plain status dot when the phone is the only active device." value={options.hideMobileBadge} onValueChange={(value: boolean) => update({ deviceIndicatorHideMobileBadge: value })} />
				</TableRowGroup>
				<RN.View style={{ paddingHorizontal: 12, paddingVertical: 6 }}><Text style={{ color: "#949ba4", fontSize: 12 }}>Device status is read from Discord's local presence and session stores.</Text></RN.View>
			</Stack>
		</ScrollView>
	);
}
