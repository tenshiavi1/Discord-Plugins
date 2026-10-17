# Avatar Handler

Avatar Handler unlocks Discord's native mobile multi-account switcher for accounts already saved in Discord.

## Authentication and Account Security

The plugin only enables Discord's own account-switcher capability. Account selection, saved sessions, login screens, 2FA challenges, and rejected-login messages remain under Discord's control. If Discord denies a login, follow its message and retry through its native flow.

Avatar Handler does not read, collect, export, or store passwords, 2FA codes, or session tokens. It does not bypass authentication or Discord's account restrictions. Accounts that are not already authorized may still require the normal Discord login process.

## Settings

The **Unlock Native Account Switcher** setting enables or disables the native capability. Enabling it requires confirmation. **Add an Account** opens Discord's native login screen directly; **Switch or Manage Accounts** opens Discord's native account manager for selecting saved accounts. The settings actions show a loading indicator while opening and block duplicate taps; Discord displays progress for authentication and account switching in its native screens. If the installed client does not expose the expected capability or native screen, the plugin reports that the feature is unavailable rather than attempting a custom login flow.

## Plugin Settings

Plugin preferences remain in the installed plugin's local storage on this device. Avatar Handler does not copy or migrate settings during account switches; switching accounts does not invoke the plugin manager's data-clearing operation. Preferences are shared on the device rather than isolated per Discord account. Uninstalling a plugin or explicitly choosing **Clear Data** or **Clear All** in Tenshi's Plugins can remove that plugin's settings.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
