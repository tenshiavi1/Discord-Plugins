import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { clearMessageHistory, updateMessageHistorySettings } from "./messageHistory";
import { setHiddenChannelFeatureEnabled } from "./hiddenChannelToggle";

const { FormRow, FormSection, FormSwitchRow } = Forms;

function TextSetting({ label, value, placeholder, disabled, onChangeText }: {
	label: string;
	value: string;
	placeholder: string;
	disabled: boolean;
	onChangeText: (value: string) => void;
}) {
	return (
		<RN.View style={{ paddingHorizontal: 16, paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
			<RN.Text style={{ color: "#b5bac1", fontSize: 14, fontWeight: "600", marginBottom: 6 }}>
				{label}
			</RN.Text>
			<RN.TextInput
				value={value}
				placeholder={placeholder}
				placeholderTextColor="#949ba4"
				editable={!disabled}
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
	const hiddenChannelsEnabled = Boolean(storage.enableHiddenChannels);
	const messageHistoryEnabled = Boolean(storage.enableMessageHistory);
	return (
		<RN.ScrollView style={{ flex: 1 }}>
			<FormSection title="Hidden Channels" titleStyleType="no_border">
				<FormSwitchRow
					label="Enable Hidden Channels"
					subLabel="Turn Sage Eyes hidden-channel handling on or off. This does not grant server permissions."
					value={hiddenChannelsEnabled}
					onValueChange={(value: boolean) => {
						storage.enableHiddenChannels = value;
						setHiddenChannelFeatureEnabled(value);
					}}
				/>
				<FormSwitchRow
					label="Show Lock Icon"
					subLabel={"Show a lock beside channels you cannot access. This is a visual indicator only and does not grant permissions."}
					disabled={!hiddenChannelsEnabled}
					onValueChange={(value) => {
						if (hiddenChannelsEnabled) storage.showIcon = value;
					}}
					value={storage.showIcon}
				/>
				<FormSwitchRow
					label="Show Popup On Hidden Channels"
					subLabel={"Ask before opening an inaccessible channel and show the channel details available to the client."}
					disabled={!hiddenChannelsEnabled}
					onValueChange={(value) => {
						if (hiddenChannelsEnabled) storage.showPopup = value;
					}}
					value={storage.showPopup}
				/>
			</FormSection>
			<FormSection title="General Logger" titleStyleType="no_border">
				<FormSwitchRow
					label="Enable General Logger"
					subLabel="Turn Sage Eyes message-history features on or off."
					value={messageHistoryEnabled}
					onValueChange={(value: boolean) => {
						storage.enableMessageHistory = value;
						setMessageHistoryFeatureEnabled(value);
					}}
				/>
				<FormSwitchRow
					label="Log Deleted Messages"
					subLabel="Replace a deleted message with a simple notice. Long-press the notice to remove it."
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.keepDeletedMessages)}
					onValueChange={(value: boolean) => {
						storage.keepDeletedMessages = value;
						updateMessageHistorySettings({ keepDeletedMessages: value });
					}}
				/>
				<FormSwitchRow
					label="Log Edited Messages"
					subLabel="Show the original and latest text separated by a downward arrow. Long-press to remove the history."
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.keepEditHistory)}
					onValueChange={(value: boolean) => {
						storage.keepEditHistory = value;
						updateMessageHistorySettings({ keepEditHistory: value });
					}}
				/>
				<FormSwitchRow
					label="Ignore Bot Messages"
					subLabel="Do not retain deletions or edits from bots."
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.ignoreBotMessages)}
					onValueChange={(value: boolean) => {
						storage.ignoreBotMessages = value;
						updateMessageHistorySettings({ ignoreBotMessages: value });
					}}
				/>
				<FormSwitchRow
					label="Ignore Your Messages"
					subLabel="Do not retain deletions or edits to your own messages."
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.ignoreOwnMessages)}
					onValueChange={(value: boolean) => {
						storage.ignoreOwnMessages = value;
						updateMessageHistorySettings({ ignoreOwnMessages: value });
					}}
				/>
				<FormRow
					label="Clear Message-History Tracking"
					subLabel="Forget retained edit versions and deleted-message records. History already applied to the current channel may remain until it is reloaded."
					disabled={!messageHistoryEnabled}
					trailing={<FormRow.Arrow />}
					onPress={() => {
						if (!messageHistoryEnabled) return;
						clearMessageHistory();
						showToast("Message history cleared");
					}}
				/>
			</FormSection>
			<FormSection title="Display" titleStyleType="no_border">
				<FormSwitchRow
					label="Add Timestamp For Edits"
					subLabel="Show a relative timestamp beside each captured version."
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.timestampForEdits)}
					onValueChange={(value: boolean) => {
						storage.timestampForEdits = value;
						updateMessageHistorySettings({ timestampForEdits: value });
					}}
				/>
			</FormSection>
			<FormSection title="Custom Buffers" titleStyleType="no_border">
				<TextSetting
					label="Deleted Indicator Text"
					value={String(storage.deletedIndicatorText ?? "This message was deleted")}
					placeholder="This message was deleted"
					disabled={!messageHistoryEnabled}
					onChangeText={(value) => {
						storage.deletedIndicatorText = value;
						updateMessageHistorySettings({ deletedIndicatorText: value });
					}}
				/>
			</FormSection>
			<FormSection
				title={`Ignored Users (${Array.isArray(storage.ignoredUserIds) ? storage.ignoredUserIds.length : 0})`}
				titleStyleType="no_border"
			>
				<FormSwitchRow
					label="Enable Ignored Users"
					subLabel="Enable profile-menu controls and skip these users in message history."
					leading={<FormRow.Icon source={getAssetIDByName("ic_person")} />}
					disabled={!messageHistoryEnabled}
					value={Boolean(storage.enableIgnoreUsers)}
					onValueChange={(value: boolean) => {
						storage.enableIgnoreUsers = value;
						updateMessageHistorySettings({ enableIgnoreUsers: value });
					}}
				/>
				{Array.isArray(storage.ignoredUserIds) && storage.ignoredUserIds.length > 0
					? storage.ignoredUserIds.map((userId: string) => (
						<FormRow
							key={userId}
							label={`User ${userId}`}
							subLabel="Ignored in Sage Eyes message history."
							disabled={!messageHistoryEnabled || !storage.enableIgnoreUsers}
							trailing={
								<RN.TouchableOpacity
									accessibilityRole="button"
									accessibilityLabel={`Remove ${userId} from Sage Eyes ignored users`}
									disabled={!messageHistoryEnabled || !storage.enableIgnoreUsers}
									style={{ paddingHorizontal: 12, paddingVertical: 8, opacity: messageHistoryEnabled && storage.enableIgnoreUsers ? 1 : 0.5 }}
									onPress={() => {
										if (!messageHistoryEnabled || !storage.enableIgnoreUsers) return;
										const ignoredUserIds = storage.ignoredUserIds.filter((id: string) => id !== userId);
										storage.ignoredUserIds = ignoredUserIds;
										updateMessageHistorySettings({ ignoredUserIds });
									}}
								>
									<RN.Text style={{ color: "#ed4245", fontWeight: "600" }}>Remove</RN.Text>
								</RN.TouchableOpacity>
							}
						/>
					))
					: <FormRow label="No Users Currently Ignored." disabled={!messageHistoryEnabled || !storage.enableIgnoreUsers} />}
			</FormSection>
		</RN.ScrollView>
	);
}
