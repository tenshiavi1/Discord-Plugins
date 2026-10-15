# God Console

God Console is a Revenge mobile plugin by tenshiavi with four optional utilities.

## Features

- **Read All** adds a guild-bar button that marks unread server channels and DMs as read.
- **Jump To Top** adds a control beside Discord's Jump to Present button to return to the top of the current chat.
- **Valid User** automatically fetches uncached users mentioned in new or loaded messages so their mentions display normally.
- **Add Attachments** registers `/addattachment` with a message ID and up to three optional file slots. It appends files to your own regular messages and replies in the current channel; run the command again to add more.

Each feature can be enabled or disabled independently in plugin settings. Mention repair processes up to ten uncached users per message, throttles requests, and does not send messages or invent users for IDs Discord cannot resolve.

Attachment uploads use Discord's upload flow and require permission to send messages in the channel. Voice messages, other users' messages, and messages already at Discord's ten-attachment limit are not supported. Discord still enforces its upload size and account limits.

## Implementation reference

Mention-cache repair is informed by [Vencord's ValidUser plugin](https://github.com/Vendicated/Vencord/tree/main/src/plugins/validUser). God Console independently adapts the user lookup and user-store update flow to Revenge's message events.

## Installation

Add this integration URL in Revenge:

`https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/God%20Console/`

## Feature references

- [Read All](https://apexteampl.github.io/Apex-Plugins/ReadAll/)
- [Jump To Top](https://tralwdwd.github.io/plugins/JumpToTop/)
- [ValidUser](https://fshinz.github.io/Revenge-Plugins/ValidUser/)

## Credits

by tenshiavi.