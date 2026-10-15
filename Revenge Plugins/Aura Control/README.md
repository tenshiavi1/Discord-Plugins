# Aura Control

Aura Control configures a custom Discord Rich Presence in Revenge. Set the activity name and type, display, details and state, party size, images, and buttons. Choose from five timestamp modes; custom start and end times use a local calendar and 24-hour clock. Connect, disconnect, and update actions publish or clear the activity.

A blank application ID uses Discord-CustomRP's public default application ID (`896771305108553788`), matching the desktop app's blank-ID behavior. This is a shared application ID, not your Discord account ID. Enter your own application ID to use assets uploaded to your application.

The mobile implementation publishes a Discord `LOCAL_ACTIVITY_UPDATE` through the client's activity dispatcher. A successful connection is restored when Discord starts, after Discord resets local activities for a new session/account switch, and when the gateway connection opens. Recovery retries transient failures without disabling the saved connection. Choosing Disconnect still disables reconnection until Connect is used again. Plugin unload during refetch does not clear the activity or erase the saved connection preference. Startup and connection timestamps persist across account switches and app reloads. It is an independent implementation informed by the configuration capabilities of [Discord-CustomRP](https://github.com/maximmax42/Discord-CustomRP) and the Revenge Rich Presence event convention; it does not bundle or reuse either project's source code.

Enable Activity Sharing in Discord's own privacy settings for other users to see the activity. Create an application in the Discord Developer Portal to use image assets and activity buttons.

Maintained by tenshiavi.
