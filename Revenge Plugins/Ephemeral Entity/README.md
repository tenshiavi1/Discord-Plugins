# Ephemeral Entity

Ephemeral Entity is a Revenge plugin that anonymizes file names for uploads to Discord chats, removes common tracking parameters from sent URLs, hides typing status, and adds a silent-leave command for group DMs. File anonymization applies to images, audio, video, documents, and other file types. It preserves file extensions, including compound extensions such as `.tar.gz`.

## Anonymization Methods

- **Random Characters** creates a new random name for each file.
- **Consistent Name** uses the configured replacement name for every file.
- **Timestamp** gives each file a unique timestamp-based replacement name.

File-name anonymization is enabled by default and can be disabled in the plugin settings. The method, random-name length, and replacement name are configurable there as well. If a file name cannot be anonymized, the upload is canceled rather than sent under its original name.

The **Remove Tracking Parameters from URLs** switch is enabled by default. It removes common advertising and click-tracking query parameters from message URLs before they are sent or edited. It uses an embedded list of parameter names; it does not download external rules or send message content to a third party. URL cleaning can be disabled independently. URLs without a recognized tracking parameter are left unchanged.

The **Enable /leave silent** switch registers `/leave silent` for group DMs. It asks Discord to close the current group DM with the `silent=true` request parameter. Discord's server behavior for silent leaving can change independently of the plugin.

The **Silent Typing** switch prevents typing-start events from being sent while enabled and leaves normal typing-stop behavior unchanged. It is enabled by default and can be toggled in the Privacy settings or with the mobile-compatible `/silenttype` command.

## Privacy

File-name anonymization and URL cleaning change uploaded file names and message URL text only; they do not alter file contents or remove embedded metadata. Silent Typing suppresses outgoing typing-start events, while `/leave silent` submits a silent-leave request to Discord. Review files for sensitive information before sharing them.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
