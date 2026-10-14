# Aura Control

Aura Control is a Revenge mobile plugin for configuring a custom Discord Rich Presence. Its settings provide activity and display choices, application ID and name, details/state with URLs, party counts, five timestamp modes with custom start/end times, large/small image keys with hover text and click-through URLs, and two URL buttons. Connect, disconnect, and update actions publish or clear the activity.

The mobile implementation publishes a Discord `LOCAL_ACTIVITY_UPDATE` through the client's activity dispatcher. It is an independent implementation informed by the configuration capabilities of [Discord-CustomRP](https://github.com/maximmax42/Discord-CustomRP) and the Revenge Rich Presence event convention; it does not bundle or reuse either project's source code.

Enable Activity Sharing in Discord's own privacy settings for other users to see the activity. Create an application in the Discord Developer Portal to use image assets and activity buttons.

Maintained by tenshiavi.
