import { ReactNative as RN, React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";
import { getAutoQuestStatus, setAutoQuestOptions, subscribeAutoQuestStatus } from "./autoQuest";
import { PluginSettingsSection } from "../../shared/pluginSettings";

const { Stack, TableRowGroup, TableSwitchRow } = findByProps(
	"Stack",
	"TableRowGroup",
	"TableSwitchRow",
);

function AutoQuestStatus() {
	const [status, setStatus] = React.useState(getAutoQuestStatus());
	React.useEffect(() => subscribeAutoQuestStatus((text, error) => setStatus({ text, error })), []);
	return (
		<RN.Text style={{ color: status.error ? "#f23f42" : "#949ba4", fontSize: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
			{status.text}
		</RN.Text>
	);
}

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Auto Quest">
					<TableSwitchRow
						label="Enable Auto Quest"
						subLabel="Complete supported video and mobile Activity Quests. Desktop Play and non-mobile Activity tasks require Venus's native app patch and are unavailable to plugins."
						value={Boolean(storage.autoQuestEnabled)}
						onValueChange={(value: boolean) => {
							storage.autoQuestEnabled = value;
							setAutoQuestOptions({ enabled: value });
						}}
					/>
					<TableSwitchRow
						disabled={!storage.autoQuestEnabled}
						label="Video Quests"
						subLabel="Report video progress at normal playback speed while Discord is active."
						value={storage.autoQuestVideo !== false}
						onValueChange={(value: boolean) => {
							storage.autoQuestVideo = value;
							setAutoQuestOptions({ video: value });
						}}
					/>
					<TableSwitchRow
						disabled={!storage.autoQuestEnabled}
						label="Mobile Activity Quests"
						subLabel="Send timed progress for Activity Quests that Discord marks as mobile-compatible."
						value={storage.autoQuestActivity !== false}
						onValueChange={(value: boolean) => {
							storage.autoQuestActivity = value;
							setAutoQuestOptions({ activity: value });
						}}
					/>
					<TableSwitchRow
						disabled={!storage.autoQuestEnabled}
						label="Accept New Quests"
						subLabel="Automatically accept eligible Quests while the app is open."
						value={storage.autoQuestEnroll !== false}
						onValueChange={(value: boolean) => {
							storage.autoQuestEnroll = value;
							setAutoQuestOptions({ enroll: value });
						}}
					/>
					<AutoQuestStatus />
				</TableRowGroup>
				<TableRowGroup title="Read All">
					<TableSwitchRow
						label="Enable /readall Command"
						subLabel="Register /readall to mark unread server channels and direct messages as read."
						value={Boolean(storage.readAllEnabled)}
						onValueChange={(value: boolean) => {
							storage.readAllEnabled = value;
							setReadAllEnabled(value);
						}}
					/>
				</TableRowGroup>
				<TableRowGroup title="Jump to Top">
					<TableSwitchRow
						label="Enable Jump to Top"
						subLabel="Add a button beside Jump to Present to return to the top of the current chat."
						value={Boolean(storage.jumpToTopEnabled)}
						onValueChange={(value: boolean) => {
							storage.jumpToTopEnabled = value;
							setJumpToTopEnabled(value);
						}}
					/>
				</TableRowGroup>
				<TableRowGroup title="Valid User">
					<TableSwitchRow
						label="Enable Valid User"
						subLabel="Resolve uncached user mentions as messages appear."
						value={Boolean(storage.validUserEnabled)}
						onValueChange={(value: boolean) => {
							storage.validUserEnabled = value;
							setValidUserEnabled(value);
						}}
					/>
				</TableRowGroup>
				<PluginSettingsSection id="god-console" />
			</Stack>
		</RN.ScrollView>
	);
}