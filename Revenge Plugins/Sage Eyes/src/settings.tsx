import { React, ReactNative as RN } from "@vendetta/metro/common";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { Forms } from "@vendetta/ui/components";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { clearMessageHistory } from "./messageHistory";

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
					label="Keep deleted messages visible"
					subLabel="Retain deleted message content in the current session when Revenge has it cached. History is memory-only and cleared when this plugin unloads."
					value={Boolean(storage.keepDeletedMessages)}
					onValueChange={(value: boolean) => { storage.keepDeletedMessages = value; }}
				/>
				<FormSwitchRow
					label="Show previous edited text"
					subLabel="Append earlier message text to edited messages when it was available before the edit."
					value={Boolean(storage.keepEditHistory)}
					onValueChange={(value: boolean) => { storage.keepEditHistory = value; }}
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
		</RN.ScrollView>
	);
}
