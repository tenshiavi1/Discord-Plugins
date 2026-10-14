# Sage Eyes

Sage Eyes is a Revenge mobile plugin by tenshiavi for inspecting hidden or obscured channel information and retaining message history in the current client session.

## Features

- Reveals channel names and details that are already available to the client but hidden or obscured by Discord's interface.
- Adds an optional lock indicator to hidden channel names.
- Can ask for confirmation before opening a hidden channel and show the channel details available to the client.
- Keeps deleted messages visible and appends previous text to edited messages when Revenge still has the original message cached.
- Adds long-press actions to remove a retained deleted-message log or restore an edited message to its current text.
- Adds Ignore/Unignore in Sage Eyes to user profile menus, with controls to manage ignored users in settings.

Sage Eyes changes client-side display and navigation behavior only. It does not grant server permissions, bypass access controls, or guarantee access to channel messages. Deleted-message and edit history is kept in memory, is limited to recent entries, and is cleared when the plugin unloads or is manually cleared; it is not a persistent message logger.

## Settings

- **Show Lock Icon** adds or removes the hidden-channel indicator.
- **Show Popup on Hidden Channels** controls the confirmation and information popup before opening a hidden channel.
- **Log deleted messages** toggles deleted-message retention.
- **Log edited messages** toggles inline display of earlier message content.
- **Ignore bot messages** and **Ignore your messages** skip those messages during history capture.
- **Minimalistic mode** selects compact one-line labels instead of the expanded multi-line history layout.
- **Use background highlight** formats deleted-message logs as quote-style highlighted blocks.
- **Add timestamp for edits** shows relative timestamps for captured versions.
- **Custom Buffers** lets you edit the deleted indicator text and edited prefix tag.
- **Ignored Users** lists users excluded through their profile menu and provides a Remove action for each.
- **Clear message-history tracking** forgets retained edit versions and deleted-message records. Content already applied to the current channel's message store may remain visible until that channel is reloaded.

Long-press a retained deleted log and choose **Remove Deleted Message** to remove it with one action. Long-press an edited message and choose **Remove Edit History** to show only its current text again. These actions are distinct from Discord's ephemeral-message dismissal; Sage Eyes does not mark its history rows as ephemeral.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

The message-history behavior was inspired by [Cute Moodle (Antied)](https://rp.jarviscli.dev/antied/install/); this is an independent implementation for Sage Eyes.

Maintained by tenshiavi.
