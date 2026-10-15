# Avatar Handler

Avatar Handler unlocks Discord's native mobile multi-account switcher for accounts already saved in Discord.

## Authentication and account security

The plugin only enables Discord's own account-switcher capability. Account selection, saved sessions, login screens, authenticator-app codes, other 2FA challenges, and rejected-login explanations remain under Discord's control. If Discord denies a login, follow the message shown by Discord and retry through its native flow.

Avatar Handler does not read, collect, export, or store passwords, authentication codes, or session tokens. It does not bypass authentication, 2FA, or Discord's account restrictions. Accounts that are not already authorized may still require the normal Discord login process.

## Settings

The **Unlock Native Account Switcher** setting enables or disables the native capability. Enabling it requires confirmation. If the installed client does not expose the expected capability, the plugin reports that the feature is unavailable rather than attempting a custom login flow.

## Other plugin settings

Plugin preferences remain in the installed plugin's local storage on this device. Avatar Handler does not copy or migrate settings during account switches; switching accounts does not invoke the plugin manager's data-clearing operation. Preferences are shared on the device rather than isolated per Discord account. Uninstalling a plugin or explicitly choosing **Clear Data** or **Clear All** in Tenshi's Plugins can remove that plugin's settings.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.
