# Sage Eyes

Sage Eyes inspects client-visible details for hidden or obscured channels and retains message history for the current client session.

## Features

- Reveals channel names and details that are already available to the client but hidden or obscured by Discord's interface.
- Adds an optional lock indicator to hidden channel names.
- Can ask for confirmation before opening a hidden channel and show the channel details available to the client.
- Includes a master Hidden Channels toggle to enable or disable hidden-channel handling, including its navigation prompts and lock indicator.
- Keeps deleted messages in place with Discord's native deleted-warning display and shows the original text as a temporary red notice when a message is edited.
- Adds long-press actions to remove a retained deleted-message log or restore an edited message to its current text.
- Adds Ignore/Unignore in Sage Eyes to user profile menus, with controls to manage ignored users in settings.
- Adds a Server Info action to the long-press menu for server icons, with member, channel, role, boost, owner, creation date, vanity URL, description, and server ID details.
- Includes separate master toggles for Hidden Channels, Server Info, General Logger, and Ignored Users; turning a master off disables its runtime patches while leaving unrelated features available.

Sage Eyes changes client-side display and navigation behavior only. It does not grant server permissions, bypass access controls, or guarantee access to channel messages. Deleted-message and edit history is kept in memory, is limited to recent entries, and is cleared when the plugin unloads or is manually cleared; it is not a persistent message logger. Disabling General Logger unpatches its features while retaining the current in-memory history for when it is re-enabled.

## Settings

- **Enable Hidden Channels** turns the hidden-channel feature on or off; its lock-icon and popup settings are disabled while it is off.
- **Show Lock Icon** adds or removes the hidden-channel indicator while the feature is enabled.
- **Show Popup on Hidden Channels** controls the confirmation and information popup before opening a hidden channel.
- **Enable Server Info** controls the Server Info action in the server-list long-press menu.
- **Enable General Logger** turns message-history handling and its related settings on or off. Its subordinate settings are disabled while it is off.
- **Log Deleted Messages** independently toggles deleted-message retention.
- **Log Edited Messages** independently toggles the temporary red notice for the previous text while edited content passes through normally.
- **Ignore Bot Messages** and **Ignore Your Messages** skip those messages during history capture.
- **Add Timestamps for Edits** adds the relative edit time to the red notice.
- **Deleted Indicator Text** lets you change the text shown for retained deleted messages.
- **Enable Ignored Users** independently enables profile-menu Ignore/Unignore actions and exclusion of listed users from message history. Its controls are disabled while General Logger is off.
- **Clear Message History** forgets retained edit versions and deleted-message records. Content already applied to the current channel may remain visible until it is reloaded.

Deleted messages retain their original content and show the native deleted-warning row. On edits, the latest content passes through normally while the prior original text appears in a separate temporary red notice; this avoids replacing or rewriting the edited message event, so other listeners such as Omniscience can process the actual edit. Prior versions are retained internally. Long-press a deleted message and choose **Remove Deleted Message** to remove it with one action. Long-press an edited message and choose **Remove Edit History** to clear its retained history. These actions are distinct from Discord's ephemeral-message dismissal; Sage Eyes does not mark its history rows as ephemeral.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

The message-history behavior was inspired by [Cute Moodle (Antied)](https://rp.jarviscli.dev/antied/install/); this is an independent implementation for Sage Eyes.

Maintained by tenshiavi.
