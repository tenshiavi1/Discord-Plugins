import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";
import { PluginSettingsToggle } from "../../shared/pluginSettings";
import { findByProps } from "../../compat";
import {
	disableNativeSwitcher,
	enableNativeSwitcher,
	openNativeAccountLogin,
	openNativeAccountManager,
} from "./nativeSwitcher";

const { TableRow, TableRowGroup, TableSwitchRow, Stack } = findByProps(
	"TableRow",
	"TableRowGroup",
	"TableSwitchRow",
	"Stack",
);

export default function Settings() {
	useProxy(storage);
	const [pendingAction, setPendingAction] = React.useState<"login" | "manager" | null>(null);
	const pendingActionTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pendingActionRef = React.useRef(false);

	React.useEffect(() => () => {
		if (pendingActionTimer.current) clearTimeout(pendingActionTimer.current);
	}, []);

	const confirmEnable = () => {
		showConfirmationAlert({
			title: "Enable Discord's Native Account Switcher?",
			content: "This only unlocks Discord's saved-account switcher. Login screens, 2FA challenges, and rejected-login messages remain in Discord. Avatar Handler does not read, collect, export, or store passwords, 2FA codes, or session tokens.",
			confirmText: "Enable",
			cancelText: "Cancel",
			onConfirm: () => {
				if (enableNativeSwitcher()) {
					storage.enabled = true;
					showToast("Discord's native account switcher is enabled.", getAssetIDByName("Check"));
				} else {
					storage.enabled = false;
					showToast("Discord's native account switcher is unavailable in this client.", getAssetIDByName("Warning"));
				}
			},
		});
	};

	const runAccountAction = async (action: "login" | "manager") => {
		if (pendingActionRef.current) return;
		pendingActionRef.current = true;
		setPendingAction(action);
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 100);
		});

		let opened = false;
		try {
			opened = action === "login"
				? openNativeAccountLogin()
				: openNativeAccountManager();
		} catch (error) {
			console.error(`[Avatar Handler] Could not open Discord's native ${action === "login" ? "account login" : "account manager"}.`, error);
		}
		if (opened) {
			showToast(
				action === "login"
					? "Discord's native account login screen is open."
					: "Discord's native account manager is open.",
				getAssetIDByName("Check"),
			);
			pendingActionTimer.current = setTimeout(() => {
				pendingActionTimer.current = undefined;
				pendingActionRef.current = false;
				setPendingAction(null);
			}, 900);
			return;
		}

		pendingActionRef.current = false;
		setPendingAction(null);
		showToast(
			action === "login"
				? "Discord's native account login is unavailable in this client."
				: "Discord's native account manager is unavailable in this client.",
			getAssetIDByName("Warning"),
		);
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
							showToast("Discord's native account switcher is disabled.", getAssetIDByName("Check"));
						}}
					/>
					<TableRow
						label={pendingAction === "login" ? "Opening Login..." : "Add an Account"}
						subLabel={pendingAction === "login"
							? "Opening Discord's native login screen..."
							: "Open Discord's native login screen. Discord handles passwords, 2FA challenges, and other verification."}
						trailing={pendingAction === "login"
							? <RN.ActivityIndicator size="small" />
							: <TableRow.Arrow />}
						disabled={!storage.enabled || pendingAction !== null}
						onPress={() => { void runAccountAction("login"); }}
					/>
					<TableRow
						label={pendingAction === "manager" ? "Opening Account Manager..." : "Switch or Manage Accounts"}
						subLabel={pendingAction === "manager"
							? "Opening Discord's native account manager..."
							: "Open Discord's native account manager to switch to a saved account or manage your account list."}
						trailing={pendingAction === "manager"
							? <RN.ActivityIndicator size="small" />
							: <TableRow.Arrow />}
						disabled={!storage.enabled || pendingAction !== null}
						onPress={() => { void runAccountAction("manager"); }}
					/>
				</TableRowGroup>
				<TableRowGroup title="Sign-In and Security">
					<TableRow
						label="Discord Handles Authentication"
						subLabel="Password entry, 2FA challenges, saved sessions, and rejected-login messages stay in Discord's native flow. If Discord denies a login, follow its message and retry there."
					/>
					<TableRow
						label="No Credentials Are Stored"
						subLabel="Avatar Handler does not read, collect, export, or store passwords, 2FA codes, or session tokens."
					/>
				</TableRowGroup>
				<TableRowGroup title="Plugin Settings">
					<TableRow
						label="Settings Stay on This Device"
						subLabel="Plugin preferences are stored locally by each installed plugin, not copied between Discord accounts. Switching accounts does not clear them. Uninstalling a plugin or using Clear Data/Clear All can remove its settings."
					/>
					<PluginSettingsToggle id="avatar-handler" />
				</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}
