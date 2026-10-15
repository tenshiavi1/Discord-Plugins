import { ReactNative as RN, React } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { setReadAllEnabled } from "./readAll";
import { setJumpToTopEnabled } from "./jumpToTop";
import { setValidUserEnabled } from "./validUser";

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
				<TableRowGroup title="Jump To Top">
					<TableSwitchRow
						label="Enable Jump To Top"
						subLabel="Add a top-of-chat button and a Jump To Top action to message menus."
						value={Boolean(storage.jumpToTopEnabled)}
						onValueChange={(value: boolean) => {
							storage.jumpToTopEnabled = value;
							setJumpToTopEnabled(value);
						}}
					/>
				</TableRowGroup>
				<TableRowGroup title="Valid User">
					<TableSwitchRow
						label="Enable Mention Repair"
						subLabel="Add a message-menu action to resolve uncached user mentions."
						value={Boolean(storage.validUserEnabled)}
						onValueChange={(value: boolean) => {
							storage.validUserEnabled = value;
							setValidUserEnabled(value);
						}}
					/>
				</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}