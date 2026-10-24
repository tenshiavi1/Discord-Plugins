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
- Open separate Word Tracker and Message History settings pages.
- Show earlier message text after edits and retain deleted messages in chat.
- Translate messages into Discord's or the phone's language, automatically or on request.
- Show desktop, mobile, web, console, and VR indicators in DM headers, member/voice lists, and profiles; optionally hide the phone badge on avatars.
- Keep deleted messages and edit history after restarting Discord, choose the retention limit, and clear retained history from settings.
- Preview and customize highlights for replies, mentions, and deleted messages.
- Add a Server Info action to server icons for client-visible details such as owner, member counts, roles, channels, boosts, and creation date.

Mention tracking uses incoming message events delivered to the active Discord client and the current account's user ID. It does not monitor saved but inactive accounts or run background polling.

Word Tracker notifications are disabled by default and run only while the plugin is active. Translation is disabled by default; when enabled, selected message text is sent to Google Translate without Discord credentials. Mentions, links, code, and emoji are excluded. In-chat edit and deletion history is kept locally; when enabled, it can be saved on this phone across restarts. Ephemeral messages are excluded. Deletion timestamps reflect when the client receives the delete event.

## Privacy

Message monitoring runs in the Revenge client. Word Tracker notifications are disabled by default. If enabled, matching content and related author/channel details are sent to the configured destination. In-chat history and server information are rendered from data already available to the client; no permission is granted for inaccessible channels. Treat webhook URLs as secrets and only configure destinations where sharing those details is appropriate.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
