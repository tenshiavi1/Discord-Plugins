# God Console

God Console is a Revenge mobile plugin with optional utilities.

## Features

- **Read All** registers `/readall` to mark unread server channels and direct messages as read.
- **Jump to Top** adds a control beside Discord's Jump to Present button to return to the top of the current chat.
- **Valid User** automatically fetches uncached users mentioned in new or loaded messages so their mentions display normally.
- **Auto Quest** can accept eligible Quests and report progress for video and mobile-compatible Activity tasks.

Each feature can be enabled or disabled independently in plugin settings. Mention repair checks every user mention in new and loaded messages, throttles lookup requests, and does not send messages or invent users for IDs Discord cannot resolve. Auto Quest is off by default. It only runs while enabled, and video progress pauses while Discord is inactive.

Auto Quest does not complete desktop Play or non-mobile Activity tasks. Venus Patches handles those with a native networking interceptor that a Revenge plugin cannot install.

## Implementation

Mention-cache repair is informed by [Vencord's ValidUser plugin](https://github.com/Vendicated/Vencord/tree/main/src/plugins/validUser). God Console independently adapts the user lookup and user-store update flow to Revenge's message events.

## Installation

Add this integration URL in Revenge:

`https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/God%20Console/`

## Feature References

- [Read All](https://apexteampl.github.io/Apex-Plugins/ReadAll/)
- [Jump to Top](https://tralwdwd.github.io/plugins/JumpToTop/)
- [Valid User](https://fshinz.github.io/Revenge-Plugins/ValidUser/)

Maintained by tenshiavi.