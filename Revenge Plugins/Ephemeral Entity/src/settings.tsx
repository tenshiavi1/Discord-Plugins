import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { METHODS } from "./filenames";
import { setTypingStatusHidden } from "./privacy";
import StableTextInput from "../../StableTextInput";
import { PluginSettingsLabel, PluginSettingsSection } from "../../shared/pluginSettings";

const { TableRow, TableRowGroup, TableSwitchRow, Stack } = findByProps(
	"TableRow",
	"TableRowGroup",
	"TableSwitchRow",
	"Stack",
);

function TextSetting({ label, storageKey, placeholder, keyboardType = "default" }: {
	label: string;
	storageKey: string;
	placeholder: string;
	keyboardType?: "default" | "numeric";
}) {
	return (
		<RN.View style={{ padding: 10 }}>
			<PluginSettingsLabel label={label} />
			<StableTextInput
				key={storageKey}
				value={String(storage[storageKey] ?? "")}
				placeholder={placeholder}
				keyboardType={keyboardType}
				onChangeText={(value: string) => {
					storage[storageKey] = keyboardType === "numeric" ? Number(value) || 0 : value;
				}}
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

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
			<TableRowGroup title="Privacy">
				<TableSwitchRow
					label="Anonymize File Names"
					subLabel="Rename files uploaded to Discord chats, including images, audio, video, documents, and other file types."
					value={Boolean(storage.anonymiseByDefault)}
					onValueChange={(value: boolean) => { storage.anonymiseByDefault = value; }}
				/>
				<TableSwitchRow
					label="Remove Tracking Parameters from URLs"
					subLabel="Remove common advertising and click-tracking parameters when you send or edit messages."
					value={Boolean(storage.clearTrackingUrls)}
					onValueChange={(value: boolean) => { storage.clearTrackingUrls = value; }}
				/>
				<TableSwitchRow
					label="Enable /leave silent"
					subLabel="Register /leave silent to leave the current group DM without a visible leave message."
					value={Boolean(storage.enableSilentLeave)}
					onValueChange={(value: boolean) => { storage.enableSilentLeave = value; }}
				/>
				<TableSwitchRow
					label="Silent Typing"
					subLabel="Suppress typing-start events while enabled; normal typing-stop behavior is unchanged. Toggle here or with /silenttype."
					value={Boolean(storage.hideTypingStatus)}
					onValueChange={(value: boolean) => {
						storage.hideTypingStatus = value;
						setTypingStatusHidden(value);
					}}
				/>
			</TableRowGroup>
			<TableRowGroup title="Anonymization Method">
				{METHODS.map((method) => (
					<TableRow
						key={method.value}
						label={`${method.label}${storage.method === method.value ? " (Selected)" : ""}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.method = method.value; }}
					/>
				))}
				{storage.method === "random" && (
					<TextSetting
						label="Random Name Length (1-64)"
						storageKey="randomizedLength"
						placeholder="7"
						keyboardType="numeric"
					/>
				)}
				{storage.method === "consistent" && (
					<TextSetting
						label="Replacement Name"
						storageKey="consistentName"
						placeholder="file"
					/>
				)}
			</TableRowGroup>
			<TableRowGroup title="About">
				<RN.Text style={{ color: "#b5bac1", padding: 12 }}>
					File extensions are preserved. File contents and metadata are unchanged. Uploads are canceled if a file name cannot be anonymized.
				</RN.Text>
			</TableRowGroup>
			<PluginSettingsSection id="ephemeral-entity" />
			</Stack>
		</RN.ScrollView>
	);
}
