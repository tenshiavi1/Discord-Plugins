# Ephemeral Entity

Ephemeral Entity is a Revenge mobile plugin by tenshiavi that replaces file names just before Discord uploads attachments. It preserves the original file extension, including compound extensions such as `.tar.gz`.

## Anonymization methods

- **Random characters** creates a new random name for each file.
- **Consistent name** uses the configured replacement name for every file.
- **Timestamp** uses the current time as the replacement name.

Anonymization is enabled by default and can be disabled in the plugin settings. The method and name length/replacement name are configurable there as well.

This only changes the filename sent with an upload. It does not alter file contents or remove metadata embedded in images, documents, or other files. Review attachments for sensitive information before sharing them.

## Source

Plugin metadata is in `manifest.json`; implementation is in `src`.

Maintained by tenshiavi.
