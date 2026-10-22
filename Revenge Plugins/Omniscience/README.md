# Omniscience

Omniscience tracks configured words in selected server channels, group DMs, and direct messages; keeps optional in-chat edit and deletion history; and displays client-visible server details.

## Features

- Add, remove, import, and export tracked keywords.
- Enable or pause Omniscience globally, or pause only Word Tracker.
- Optionally track direct mentions of the currently active Discord account.
- Choose whether to track everyone, friends, or selected user IDs.
- Include or exclude servers, channels, and users; choose whether to track embeds or ignore bots.
- Configure whole-word, exact-match, case-sensitive, and in-sentence matching.
- Optionally forward matches to a channel or webhook.
- Open separate Word Tracker, DM Logger, and Deleted Messages settings pages.
- Optionally forward incoming direct and group DMs to a dedicated channel, Discord webhook, or both.
- Optionally record edits and deletions in one selected channel, forwarding logs to a separate destination channel, webhook, or both.
- Show temporary notices with earlier message text after edits, and retain deleted messages in chat.
- Add a Server Info action to server icons for client-visible details such as owner, member counts, roles, channels, boosts, and creation date.
- Ignore selected users, bots, or your own messages in in-chat history.

Mention tracking uses incoming message events delivered to the active Discord client and the current account's user ID. It does not monitor saved but inactive accounts or run background polling.

Forwarded DM and channel logging is disabled by default and runs only while the plugin is active. DM request messages are recorded only when Discord delivers their message events to the client. Forwarded edit and delete logs require the plugin to have previously observed and cached the message; the cache is limited to 500 messages. In-chat history is local to the current client session and is cleared when the plugin unloads or is manually cleared. Deletion timestamps reflect when the client receives the delete event.

## Privacy

Message monitoring runs in the Revenge client. Channel and webhook forwarding are disabled by default. If enabled, matching content and related author/channel details are sent to the configured destination. DM and cached edit/deletion details are sent only to configured destinations. In-chat history and server information are rendered from data already available to the client; no permission is granted for inaccessible channels. Treat webhook URLs as secrets and only configure destinations where sharing those details is appropriate.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
