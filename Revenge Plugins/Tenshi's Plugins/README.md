# Tenshi's Plugins

Tenshi's Plugins adds a searchable catalog of published Revenge plugins to Revenge's settings.

## Features

- Search plugin names, descriptions, features, and settings.
- Manage plugins individually: install, configure, refetch, update, clear data, or delete them. Newly discovered plugins are not installed automatically.
- Use bulk actions to install, refetch, remove, or clear data. The manager processes itself last.
- Review the latest 50 manager operations and copy the activity log.
- The **Auto On** button refetches installed plugins after each Revenge startup or restart. New plugins are never installed automatically.
- Restart Revenge and return to the manager page.

Each installed plugin includes its own crash guard, so fatal JavaScript errors are recorded even when Tenshi's Plugins is not installed. When the manager is present, it also shows crash records and recent attributed fatal errors. The affected plugin applies queued feature disables on its next load; the manager also migrates older recovery records. Use **Copy Latest Error Log** to copy the full diagnostic entry.

If the manager's own bundle changes during a refetch, Manager Activity recommends restarting Revenge to load it. That reminder remains visible until the next Revenge runtime starts.

Automatic refetch runs a few seconds after the manager starts and records its results in Manager Activity. It requires an internet connection and only runs while Tenshi's Plugins is installed.

Tenshi's Plugins enables Discord's native Developer Mode while it is active. Unload or disable the manager to stop enforcing that setting. The catalog discovers Revenge plugins from the [Discord-Plugins repository](https://github.com/tenshiavi1/Discord-Plugins); Vencord plugins use a different client and are not listed.

Maintained by tenshiavi.
