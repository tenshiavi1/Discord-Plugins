import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { clearMessageHistory, updateMessageHistorySettings } from "./messageHistory";
import { setHiddenChannelFeatureEnabled } from "./hiddenChannelToggle";

const { FormRow, FormSection, FormSwitchRow } = Forms;

function TextSetting({ label, value, placeholder, onChangeText }: {
	label: string;
	value: string;
	placeholder: string;
	onChangeText: (value: string) => void;
}) {
	return (
		<RN.View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
			<RN.Text style={{ color: "#b5bac1", fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
				{label}
			</RN.Text>
			<RN.TextInput
				value={value}
				placeholder={placeholder}
				placeholderTextColor="#949ba4"
				onChangeText={onChangeText}
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

export function Settings() {
	useProxy(storage);
	return (
		<RN.ScrollView style={{ flex: 1 }}>
			<FormSection title="Hidden Channels" titleStyleType="no_border">
				<FormSwitchRow
					label="Enable Hidden Channels"
					subLabel="Turn Sage Eyes hidden-channel handling on or off. This does not grant server permissions."
					leading={<FormRow.Icon source={getAssetIDByName("ic_lock")} />}
					value={Boolean(storage.enableHiddenChannels)}
					onValueChange={(value: boolean) => {
						storage.enableHiddenChannels = value;
						setHiddenChannelFeatureEnabled(value);
					}}
				/>
				<FormSwitchRow
					label={"Show Lock Icon"}
					subLabel={"Show a lock beside channels you cannot access. This is a visual indicator only and does not grant permissions."}
					leading={<FormRow.Icon source={getAssetIDByName("ic_lock")} />}
					onValueChange={(value) => (storage.showIcon = value)}
					value={storage.showIcon}
				/>
				<FormSwitchRow
					label={"Show Popup on Hidden Channels"}
					subLabel={"Ask before opening an inaccessible channel and show the channel details available to the client."}
					leading={<FormRow.Icon source={getAssetIDByName("ic_more_android")} />}
					onValueChange={(value) => (storage.showPopup = value)}
					value={storage.showPopup}
				/>
			</FormSection>
			<FormSection title="General Logger" titleStyleType="no_border">
				<FormSwitchRow
					label="Log deleted messages"
					subLabel="Replace a deleted message with a simple notice. Long-press the notice to remove it."
					value={Boolean(storage.keepDeletedMessages)}
					onValueChange={(value: boolean) => {
						storage.keepDeletedMessages = value;
						updateMessageHistorySettings({ keepDeletedMessages: value });
					}}
				/>
				<FormSwitchRow
					label="Log edited messages"
					subLabel="Show the original and latest text with a short edited label. Long-press to remove the label."
					value={Boolean(storage.keepEditHistory)}
					onValueChange={(value: boolean) => {
						storage.keepEditHistory = value;
						updateMessageHistorySettings({ keepEditHistory: value });
					}}
				/>
				<FormSwitchRow
					label="Ignore bot messages"
					subLabel="Do not retain deletions or edits from bots."
					value={Boolean(storage.ignoreBotMessages)}
					onValueChange={(value: boolean) => {
						storage.ignoreBotMessages = value;
						updateMessageHistorySettings({ ignoreBotMessages: value });
					}}
				/>
				<FormSwitchRow
					label="Ignore your messages"
					subLabel="Do not retain deletions or edits to your own messages."
					value={Boolean(storage.ignoreOwnMessages)}
					onValueChange={(value: boolean) => {
						storage.ignoreOwnMessages = value;
						updateMessageHistorySettings({ ignoreOwnMessages: value });
					}}
				/>
				<FormRow
					label="Clear message-history tracking"
					subLabel="Forget retained edit versions and deleted-message records. History already applied to the current channel may remain until it is reloaded."
					trailing={<FormRow.Arrow />}
					onPress={() => {
						clearMessageHistory();
						showToast("Message history cleared");
					}}
				/>
			</FormSection>
			<FormSection title="Display" titleStyleType="no_border">
				<FormSwitchRow
					label="Add timestamp for edits"
					subLabel="Show a relative timestamp beside each captured version."
					value={Boolean(storage.timestampForEdits)}
					onValueChange={(value: boolean) => {
						storage.timestampForEdits = value;
						updateMessageHistorySettings({ timestampForEdits: value });
					}}
				/>
			</FormSection>
			<FormSection title="Custom Buffers" titleStyleType="no_border">
				<TextSetting
					label="Deleted indicator text"
					value={String(storage.deletedIndicatorText ?? "This message was deleted")}
					placeholder="This message was deleted"
					onChangeText={(value) => {
						storage.deletedIndicatorText = value;
						updateMessageHistorySettings({ deletedIndicatorText: value });
					}}
				/>
				<TextSetting
					label="Edited prefix tag"
					value={String(storage.editedPrefixTag ?? "(edited)")}
					placeholder="(edited)"
					onChangeText={(value) => {
						storage.editedPrefixTag = value;
						updateMessageHistorySettings({ editedPrefixTag: value });
					}}
				/>
			</FormSection>
			<FormSection
				title={`Ignored Users (${Array.isArray(storage.ignoredUserIds) ? storage.ignoredUserIds.length : 0})`}
				titleStyleType="no_border"
			>
				{Array.isArray(storage.ignoredUserIds) && storage.ignoredUserIds.length > 0
					? storage.ignoredUserIds.map((userId: string) => (
						<FormRow
							key={userId}
							label={`User ${userId}`}
							subLabel="Ignored in Sage Eyes message history."
							trailing={
								<RN.TouchableOpacity
									accessibilityRole="button"
									accessibilityLabel={`Remove ${userId} from Sage Eyes ignored users`}
									onPress={() => {
										const ignoredUserIds = storage.ignoredUserIds.filter((id: string) => id !== userId);
										storage.ignoredUserIds = ignoredUserIds;
										updateMessageHistorySettings({ ignoredUserIds });
									}}
									style={{ paddingHorizontal: 12, paddingVertical: 8 }}
								>
									<RN.Text style={{ color: "#ed4245", fontWeight: "600" }}>Remove</RN.Text>
								</RN.TouchableOpacity>
							}
						/>
					))
					: <FormRow label="No users currently ignored." />}
			</FormSection>
		</RN.ScrollView>
	);
}
