# Ephemeral Entity

Ephemeral Entity is a Revenge mobile plugin by tenshiavi that replaces file names just before Discord uploads attachments. It preserves the original file extension, including compound extensions such as `.tar.gz`.

## Anonymization methods

- **Random characters** creates a new random name for each file.
- **Consistent name** uses the configured replacement name for every file.
- **Timestamp** uses the current time as the replacement name.

File-name anonymization is enabled by default and can be disabled in the plugin settings. The method and name length/replacement name are configurable there as well.

The **Remove tracking parameters from sent URLs** switch is enabled by default. It removes common advertising/click-tracking query parameters from URLs in messages before they are sent or edited. This uses an embedded set of common parameter names; it does not download external rules or send message content to a third party. URL cleaning can be disabled independently in settings. URLs without a recognized tracking parameter are left as-is.

These features only change attachment names and message URL text. They do not alter file contents or remove metadata embedded in images, documents, or other files. Review attachments for sensitive information before sharing them.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
