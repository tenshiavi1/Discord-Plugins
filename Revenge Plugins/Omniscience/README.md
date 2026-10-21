# Omniscience

Omniscience tracks configured words in selected server channels, group DMs, and direct messages, and provides optional account-local chat logging.

## Features

- Add, remove, import, and export tracked keywords.
- Enable or pause keyword monitoring with its master toggle.
- Optionally track direct mentions of the currently active Discord account.
- Choose whether to track everyone, friends, or selected user IDs.
- Include or exclude servers, channels, and users; choose whether to track embeds or ignore bots.
- Configure whole-word, exact-match, case-sensitive, and in-sentence matching.
- Optionally forward matches to a channel or webhook.
- Open separate Word Tracker and Chat Logger settings pages.
- Optionally forward incoming direct and group DMs to a channel or Discord webhook.
- Optionally record edits and deletions in one selected channel, forwarding logs to a destination channel.

Mention tracking uses incoming message events delivered to the active Discord client and the current account's user ID. It does not monitor saved but inactive accounts or run background polling.

Chat logging is disabled by default and runs only while the plugin is active. DM request messages are recorded only when Discord delivers their message events to the client. Edit and delete logs require the plugin to have previously observed and cached the message; the cache is limited to 500 messages and is cleared when Message Logger is disabled. Deletion timestamps reflect when the client receives the delete event.

## Privacy

Message monitoring runs in the Revenge client. Channel and webhook forwarding are disabled by default. If enabled, matching content and related author/channel details are sent to the configured destination. Chat Logger forwarding is also opt-in; DM content or cached message edits and deletions are sent only to the configured destinations. Treat webhook URLs as secrets and only configure destinations where sharing those details is appropriate.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
