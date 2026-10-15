import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import { findByProps } from "../../compat";
import { disableNativeSwitcher, enableNativeSwitcher, openNativeAccountManager } from "./nativeSwitcher";

const { TableRow, TableRowGroup, TableSwitchRow, Stack } = findByProps(
	"TableRow",
	"TableRowGroup",
	"TableSwitchRow",
	"Stack",
);

export default function Settings() {
	useProxy(storage);

	const confirmEnable = () => {
		showConfirmationAlert({
			title: "Enable Discord's native account switcher?",
			content: "This only unlocks Discord's own saved-account switcher. Login screens, authenticator/2FA prompts, and rejected-login messages remain inside Discord. Avatar Handler never reads or stores passwords, authentication codes, or session tokens.",
			confirmText: "Enable",
			cancelText: "Cancel",
			onConfirm: () => {
				if (enableNativeSwitcher()) {
					storage.enabled = true;
					showToast("Discord's native account switcher enabled", getAssetIDByName("Check"));
				} else {
					storage.enabled = false;
					showToast("Discord's account switcher is unavailable in this client", getAssetIDByName("Warning"));
				}
			},
		});
	};

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Discord Account Switcher">
					<TableSwitchRow
						label="Unlock Native Account Switcher"
						subLabel="Enable Discord's built-in mobile account switcher for accounts already saved in Discord."
						value={Boolean(storage.enabled)}
						onValueChange={(enabled: boolean) => {
							if (enabled) {
								confirmEnable();
								return;
							}
							disableNativeSwitcher();
							storage.enabled = false;
							showToast("Discord's native account switcher disabled", getAssetIDByName("Check"));
						}}
					/>
					<TableRow
						label="Add or switch accounts"
						subLabel="Open Discord's account manager to add or switch accounts. Any required login or authenticator code is handled by Discord."
						trailing={<TableRow.Arrow />}
						disabled={!storage.enabled}
						onPress={() => {
							if (openNativeAccountManager()) {
								showToast("Opened Discord's native account manager", getAssetIDByName("Check"));
							} else {
								showToast("Discord's account manager is unavailable in this client", getAssetIDByName("Warning"));
							}
						}}
					/>
				</TableRowGroup>
				<TableRowGroup title="Security and Login Responses">
					<TableRow
						label="Discord handles authentication"
						subLabel="Passwords, authenticator codes, saved sessions, and login denials stay in Discord's native flow. If login is denied, follow Discord's message and retry there."
					/>
					<TableRow
						label="No credentials are stored"
						subLabel="Avatar Handler does not collect, export, or save account passwords, 2FA codes, or session tokens."
					/>
				</TableRowGroup>
				<TableRowGroup title="Plugin Settings">
					<TableRow
						label="Settings stay on this device"
						subLabel="Plugin preferences are stored locally by each installed plugin, not copied between Discord accounts. Switching accounts does not clear them. Uninstalling a plugin or using Clear Data/Clear All can remove its settings."
					/>
				</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}
