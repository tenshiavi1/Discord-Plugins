# Ephemeral Entity

Ephemeral Entity is a Revenge mobile plugin by tenshiavi that replaces file names just before Discord uploads attachments. It preserves the original file extension, including compound extensions such as `.tar.gz`.

## Anonymization Methods

- **Random Characters** creates a new random name for each file.
- **Consistent Name** uses the configured replacement name for every file.
- **Timestamp** uses the current time as the replacement name.

File-name anonymization is enabled by default and can be disabled in the plugin settings. The method and name length/replacement name are configurable there as well.

The **Remove Tracking Parameters From Sent URLs** switch is enabled by default. It removes common advertising/click-tracking query parameters from URLs in messages before they are sent or edited. This uses an embedded set of common parameter names; it does not download external rules or send message content to a third party. URL cleaning can be disabled independently in settings. URLs without a recognized tracking parameter are left as-is.

The **Enable Silent /leave Command** switch registers a `/leave silent` command for group DMs. Running it asks Discord to close the current group DM with the `silent=true` request parameter. Discord's server behavior for silent leaving can change independently of the plugin.

The **Silent Typing** switch prevents typing-start events from being sent while enabled and leaves normal typing-stop behavior unchanged. It is enabled by default and can be toggled in the Privacy settings or with the mobile-compatible `/silenttype` command.

File-name anonymization and URL cleaning only change attachment names and message URL text; they do not alter file contents or remove metadata embedded in images, documents, or other files. Silent Typing controls the client's outgoing typing-start events, while `/leave silent` submits a silent-leave request to Discord. Review attachments for sensitive information before sharing them.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
