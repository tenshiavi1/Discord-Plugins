import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { showToast } from "@vendetta/ui/toasts";
import {
	ACTIVITY_TYPES,
	DISPLAY_TYPES,
	clearActivity,
	publishActivity,
	TIMESTAMP_MODES,
	validateConfiguration,
	type ActivityConfiguration,
} from "./activity";

const { TableRow, TableRowGroup, TableSwitchRow, Stack } = findByProps(
	"TableRow",
	"TableRowGroup",
	"TableSwitchRow",
	"Stack",
);

function TextSetting({ label, storageKey, placeholder, limit = 128 }: {
	label: string;
	storageKey: string;
	placeholder?: string;
	limit?: number;
}) {
	return (
		<RN.View style={{ padding: 10 }}>
			<RN.Text style={{ color: "#f2f3f5", fontSize: 14, marginBottom: 6 }}>{label}</RN.Text>
			<RN.TextInput
				value={typeof storage[storageKey] === "string" ? storage[storageKey] : ""}
				placeholder={placeholder ?? label}
				placeholderTextColor="#949ba4"
				maxLength={limit}
				autoCapitalize="none"
				onChangeText={(value: string) => { storage[storageKey] = value; }}
				style={{
					color: "#f2f3f5",
					backgroundColor: "#1e1f22",
					borderRadius: 8,
					paddingHorizontal: 12,
					paddingVertical: 10,
				}}
			/>
		</RN.View>
	);
}

async function publishWithFeedback(successMessage: string): Promise<boolean> {
	const errors = validateConfiguration(storage as ActivityConfiguration);
	if (storage.enabled && errors.length > 0) {
		storage.enabled = false;
		try {
			clearActivity();
		} catch (error) {
			console.error("[Aura Control] Could not clear activity after validation failed.", error);
		}
		showToast(`${errors[0]} Aura Control was disconnected.`);
		return false;
	}
	try {
		await publishActivity();
		if (!storage.enabled) return false;
		showToast(successMessage);
		return true;
	} catch (error) {
		console.error("[Aura Control] Failed to update the activity.", error);
		storage.enabled = false;
		try {
			clearActivity();
		} catch (clearError) {
			console.error("[Aura Control] Could not clear activity after publishing failed.", clearError);
		}
		showToast(`${error instanceof Error ? error.message : "Could not update activity."} Aura Control was disconnected.`);
		return false;
	}
}

async function connect(): Promise<void> {
	storage.enabled = true;
	await publishWithFeedback("Connected and publishing Aura Control activity.");
}

async function disconnect(): Promise<void> {
	storage.enabled = false;
	try {
		clearActivity();
		showToast("Disconnected and cleared the activity.");
	} catch (error) {
		console.error("[Aura Control] Could not disconnect the activity.", error);
		showToast("Aura Control disconnected, but Discord's activity could not be cleared.");
	}
}

async function updatePresence(): Promise<void> {
	if (!storage.enabled) {
		showToast("Connect before updating the activity.");
		return;
	}
	await publishWithFeedback("Presence updated.");
}

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
			<TableRowGroup title="Application">
				<TextSetting label="Application ID (Optional)" storageKey="applicationId" placeholder="Defaults to Discord-CustomRP's public application" limit={21} />
				<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
					Leave blank to connect with the public default application. Enter your own ID to use assets uploaded to your application.
				</RN.Text>
				<TextSetting label="Name" storageKey="applicationName" />
			</TableRowGroup>
			<TableRowGroup title="Activity Type">
				{ACTIVITY_TYPES.map((type) => (
					<TableRow
						key={`activity-type-${type.value}`}
						label={`${Number(storage.activityType) === type.value ? "(Selected) " : ""}${type.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.activityType = type.value; }}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup title="Display">
				{DISPLAY_TYPES.map((type) => (
					<TableRow
						key={`display-type-${type.value}`}
						label={`${Number(storage.displayType) === type.value ? "(Selected) " : ""}${type.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.displayType = type.value; }}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup title="Details And State">
				<TextSetting label="Details" storageKey="details" />
				<TextSetting label="Details URL" storageKey="detailsUrl" placeholder="https://example.com" limit={512} />
				<TextSetting label="State" storageKey="state" />
				<TextSetting label="State URL" storageKey="stateUrl" placeholder="https://example.com" limit={512} />
				{storage.activityType === 1 && (
					<TextSetting label="Stream URL (Twitch Or YouTube)" storageKey="streamUrl" placeholder="https://twitch.tv/..." limit={512} />
				)}
			</TableRowGroup>
			<TableRowGroup title="Party">
				<TextSetting 				label="Current Party Size" storageKey="partySize" placeholder="Optional whole number" limit={9} />
				<TextSetting 				label="Party Maximum" storageKey="partyMaxSize" placeholder="Optional whole number" limit={9} />
			</TableRowGroup>
			<TableRowGroup title="Timestamp">
				<RN.Text style={{ color: "#b5bac1", padding: 12 }}>
					"Since last connection" starts when Aura Control is enabled in this client session.
				</RN.Text>
				{TIMESTAMP_MODES.map((mode) => (
					<TableRow
						key={`timestamp-${mode.value}`}
						label={`${storage.timestampMode === mode.value ? "(Selected) " : ""}${mode.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.timestampMode = mode.value; }}
					/>
				))}
				{storage.timestampMode === "custom" && (
					<>
						<TextSetting
							label="Start (Local Time: YYYY-MM-DD HH:MM)"
							storageKey="timestampCustomStart"
							placeholder="2026-10-14 19:00"
							limit={16}
						/>
						<TableSwitchRow
							label="Set End Timestamp"
							value={Boolean(storage.timestampEndEnabled)}
							onValueChange={(value: boolean) => { storage.timestampEndEnabled = value; }}
						/>
						{storage.timestampEndEnabled && (
							<TextSetting
								label="End (Local Time: YYYY-MM-DD HH:MM)"
								storageKey="timestampCustomEnd"
								placeholder="2026-10-14 20:00"
								limit={16}
							/>
						)}
					</>
				)}
			</TableRowGroup>
			<TableRowGroup title="Large Image">
				<RN.Text style={{ color: "#b5bac1", padding: 12 }}>
					Choose an asset key uploaded to this application's Rich Presence settings.
				</RN.Text>
				<TextSetting label="Key" storageKey="largeImageKey" limit={256} />
				<TextSetting label="Text" storageKey="largeImageText" />
				<TextSetting label="URL" storageKey="largeImageUrl" placeholder="https://example.com" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Small Image">
				<TextSetting label="Key" storageKey="smallImageKey" limit={256} />
				<TextSetting label="Text" storageKey="smallImageText" />
				<TextSetting label="URL" storageKey="smallImageUrl" placeholder="https://example.com" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Button 1">
				<TextSetting label="Text" storageKey="buttonOneLabel" limit={32} />
				<TextSetting label="URL" storageKey="buttonOneUrl" placeholder="https://example.com" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Button 2">
				<TextSetting label="Text" storageKey="buttonTwoLabel" limit={32} />
				<TextSetting label="URL" storageKey="buttonTwoUrl" placeholder="https://example.com" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Presence">
				<TableRow
					label="Activity Sharing"
					subLabel="Enable Activity Sharing in Discord privacy settings so other people can see this activity."
				/>
				<TableRow
					label="Connect"
					subLabel="Validate the configuration and start publishing."
					trailing={<TableRow.Arrow />}
					onPress={connect}
					disabled={Boolean(storage.enabled)}
				/>
				<TableRow
					label="Disconnect"
					subLabel="Clear Aura Control's activity."
					trailing={<TableRow.Arrow />}
					onPress={disconnect}
					disabled={!storage.enabled}
				/>
				<TableRow
					label="Update Presence"
					subLabel="Publish the latest configuration while connected."
					trailing={<TableRow.Arrow />}
					onPress={updatePresence}
					disabled={!storage.enabled}
				/>
			</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}
