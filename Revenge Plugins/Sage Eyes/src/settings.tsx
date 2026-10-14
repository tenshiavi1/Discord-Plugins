import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { clearMessageHistory, updateMessageHistorySettings } from "./messageHistory";

const { FormRow, FormSection, FormSwitchRow } = Forms;

export function Settings() {
	useProxy(storage);
	return (
		<RN.ScrollView style={{ flex: 1 }}>
			<FormSection title="Options" titleStyleType="no_border">
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
			<FormSection title="Message history" titleStyleType="no_border">
				<FormSwitchRow
					label="Keep deleted message logs"
					subLabel="Show locally cached deleted messages in chat. Long-press a log and choose Remove Deleted Message to dismiss it in one action."
					value={Boolean(storage.keepDeletedMessages)}
					onValueChange={(value: boolean) => {
						storage.keepDeletedMessages = value;
						updateMessageHistorySettings({ keepDeletedMessages: value });
					}}
				/>
				<FormSwitchRow
					label="Keep edit history"
					subLabel="Append earlier text to edited messages. Long-press a message and choose Remove Edit History to restore its current text."
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
			{Array.isArray(storage.ignoredUserIds) && storage.ignoredUserIds.length > 0 && (
				<FormSection title={`Ignored users (${storage.ignoredUserIds.length})`} titleStyleType="no_border">
					{storage.ignoredUserIds.map((userId: string) => (
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
					))}
				</FormSection>
			)}
		</RN.ScrollView>
	);
}
