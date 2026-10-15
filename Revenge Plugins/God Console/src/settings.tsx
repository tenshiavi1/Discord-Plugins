import { ReactNative as RN, React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";
import { setAddAttachmentsEnabled } from "./addAttachments";

const { Stack, TableRowGroup, TableSwitchRow } = findByProps(
	"Stack",
	"TableRowGroup",
	"TableSwitchRow",
);

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Read All">
					<TableSwitchRow
						label="Enable Read All Button"
						subLabel="Add a guild-bar button to mark unread server channels and DMs as read."
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
				<TableRowGroup title="Add Attachments">
					<TableSwitchRow
						label="Enable /addattachment"
						subLabel="Add up to three files to your own message in the current channel."
						value={Boolean(storage.addAttachmentsEnabled)}
						onValueChange={(value: boolean) => {
							storage.addAttachmentsEnabled = value;
							setAddAttachmentsEnabled(value);
						}}
					/>
				</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}