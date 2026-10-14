import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import {
	ACTIVITY_TYPES,
	DISPLAY_TYPES,
	publishActivity,
	TIMESTAMP_MODES,
	validateConfiguration,
	type ActivityConfiguration,
} from "./activity";

const { FormRow, FormSection, FormSwitchRow } = Forms;

function TextSetting({ label, storageKey, placeholder, limit = 128 }: {
	label: string;
	storageKey: string;
	placeholder?: string;
	limit?: number;
}) {
	return (
		<RN.View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
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
		showToast(errors[0]);
		return false;
	}
	try {
		await publishActivity();
		showToast(successMessage);
		return true;
	} catch (error) {
		console.error("[Aura Control] Failed to update the activity.", error);
		showToast(error instanceof Error ? error.message : "Could not update activity.");
		return false;
	}
}

async function connect(): Promise<void> {
	storage.enabled = true;
	if (!await publishWithFeedback("Connected and publishing Aura Control activity.")) {
		storage.enabled = false;
	}
}

async function disconnect(): Promise<void> {
	storage.enabled = false;
	await publishWithFeedback("Disconnected and cleared the activity.");
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
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
			<FormSection title="Application" titleStyleType="no_border">
				<TextSetting label="Application ID (optional)" storageKey="applicationId" placeholder="Defaults to Discord-CustomRP's public application" limit={21} />
				<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
					Leave blank to connect with the public default application. Enter your own ID to use assets uploaded to your application.
				</RN.Text>
				<TextSetting label="Name" storageKey="applicationName" />
			</FormSection>
			<FormSection title="Activity type" titleStyleType="no_border">
				{ACTIVITY_TYPES.map((type) => (
					<FormRow
						key={`activity-type-${type.value}`}
						label={`${Number(storage.activityType) === type.value ? "(Selected) " : ""}${type.label}`}
						onPress={() => { storage.activityType = type.value; }}
					/>
				))}
			</FormSection>
			<FormSection title="Display" titleStyleType="no_border">
				{DISPLAY_TYPES.map((type) => (
					<FormRow
						key={`display-type-${type.value}`}
						label={`${Number(storage.displayType) === type.value ? "(Selected) " : ""}${type.label}`}
						onPress={() => { storage.displayType = type.value; }}
					/>
				))}
			</FormSection>
			<FormSection title="Details and state" titleStyleType="no_border">
				<TextSetting label="Details" storageKey="details" />
				<TextSetting label="Details URL" storageKey="detailsUrl" placeholder="https://example.com" limit={512} />
				<TextSetting label="State" storageKey="state" />
				<TextSetting label="State URL" storageKey="stateUrl" placeholder="https://example.com" limit={512} />
				{storage.activityType === 1 && (
					<TextSetting label="Stream URL (Twitch or YouTube)" storageKey="streamUrl" placeholder="https://twitch.tv/..." limit={512} />
				)}
			</FormSection>
			<FormSection title="Party" titleStyleType="no_border">
				<TextSetting label="Current party size" storageKey="partySize" placeholder="Optional whole number" limit={9} />
				<TextSetting label="Party maximum" storageKey="partyMaxSize" placeholder="Optional whole number" limit={9} />
			</FormSection>
			<FormSection title="Timestamp" titleStyleType="no_border">
				<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
					"Since last connection" starts when Aura Control is enabled in this client session.
				</RN.Text>
				{TIMESTAMP_MODES.map((mode) => (
					<FormRow
						key={`timestamp-${mode.value}`}
						label={`${storage.timestampMode === mode.value ? "(Selected) " : ""}${mode.label}`}
						onPress={() => { storage.timestampMode = mode.value; }}
					/>
				))}
				{storage.timestampMode === "custom" && (
					<>
						<TextSetting
							label="Start (local time: YYYY-MM-DD HH:MM)"
							storageKey="timestampCustomStart"
							placeholder="2026-10-14 19:00"
							limit={16}
						/>
						<FormSwitchRow
							label="Set end timestamp"
							value={Boolean(storage.timestampEndEnabled)}
							onValueChange={(value: boolean) => { storage.timestampEndEnabled = value; }}
						/>
						{storage.timestampEndEnabled && (
							<TextSetting
								label="End (local time: YYYY-MM-DD HH:MM)"
								storageKey="timestampCustomEnd"
								placeholder="2026-10-14 20:00"
								limit={16}
							/>
						)}
					</>
				)}
			</FormSection>
			<FormSection title="Large image" titleStyleType="no_border">
				<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
					Choose an asset key uploaded to this application's Rich Presence settings.
				</RN.Text>
				<TextSetting label="Key" storageKey="largeImageKey" limit={256} />
				<TextSetting label="Text" storageKey="largeImageText" />
				<TextSetting label="URL" storageKey="largeImageUrl" placeholder="https://example.com" limit={512} />
			</FormSection>
			<FormSection title="Small image" titleStyleType="no_border">
				<TextSetting label="Key" storageKey="smallImageKey" limit={256} />
				<TextSetting label="Text" storageKey="smallImageText" />
				<TextSetting label="URL" storageKey="smallImageUrl" placeholder="https://example.com" limit={512} />
			</FormSection>
			<FormSection title="Button 1" titleStyleType="no_border">
				<TextSetting label="Text" storageKey="buttonOneLabel" limit={32} />
				<TextSetting label="URL" storageKey="buttonOneUrl" placeholder="https://example.com" limit={512} />
			</FormSection>
			<FormSection title="Button 2" titleStyleType="no_border">
				<TextSetting label="Text" storageKey="buttonTwoLabel" limit={32} />
				<TextSetting label="URL" storageKey="buttonTwoUrl" placeholder="https://example.com" limit={512} />
			</FormSection>
			<FormSection title="Presence" titleStyleType="no_border">
				<FormRow
					label="Activity Sharing"
					subLabel="Enable Activity Sharing in Discord privacy settings so other people can see this activity."
				/>
				<FormRow
					label="Connect"
					subLabel="Validate the configuration and start publishing."
					onPress={connect}
					disabled={Boolean(storage.enabled)}
				/>
				<FormRow
					label="Disconnect"
					subLabel="Clear Aura Control's activity."
					onPress={disconnect}
					disabled={!storage.enabled}
				/>
				<FormRow
					label="Update Presence"
					subLabel="Publish the latest configuration while connected."
					onPress={updatePresence}
					disabled={!storage.enabled}
				/>
			</FormSection>
		</RN.ScrollView>
	);
}
