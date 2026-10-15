# Omniscience

Omniscience is a Revenge mobile keyword-tracking plugin by tenshiavi. It monitors selected server channels, group DMs, and direct messages for configured words or phrases, then shows a local notification.

## Features

- Add, remove, import, and export tracked keywords.
- Enable or pause keyword monitoring with its master toggle.
- Optionally track direct mentions of the currently active Discord account.
- Choose whether to track everyone, friends, or selected user IDs.
- Include or exclude servers, channels, and users; choose whether to track embeds or ignore bots.
- Configure whole-word, exact-match, case-sensitive, and in-sentence matching.
- Optionally forward matches to a channel or webhook.

Mention tracking uses incoming message events delivered to the active Discord client and the current account's user ID. It does not monitor saved but inactive accounts or run background polling.

## Privacy

Message monitoring runs in the Revenge client. Channel and webhook forwarding are disabled by default. If enabled, matching message content and related author/channel/server details are sent to the destination configured by that user. Treat webhook URLs as secrets and only configure destinations where sharing those details is appropriate.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
