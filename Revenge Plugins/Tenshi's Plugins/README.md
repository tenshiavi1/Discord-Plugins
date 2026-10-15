# Tenshi's Plugins

Tenshi's Plugins adds a shortcut to Revenge's main settings with a catalog of the Revenge plugins published in the [Discord-Plugins repository](https://github.com/tenshiavi1/Discord-Plugins).

While enabled, the plugin turns on Discord's native Developer Mode and keeps it enabled when Discord applies settings updates. Disable Tenshi's Plugins to remove this behavior.

Each catalog item is displayed in a separate card with a responsive, left-aligned title on the first line, plugin controls on the second line, and a full-width description below. Search matches names and descriptions as well as plugin-specific feature and settings keywords, and supports multiple terms. The page header provides Manage for fetching, bulk installation, removal, or data clearing, and Restart to relaunch Revenge and return to this page. Manage opens an action chooser, and actions that change plugins show a separate confirmation warning; the manager itself is processed last. Newly discovered plugins remain uninstalled until their Install button is used. Each card provides:

- A crash console that saves the latest uncaught JavaScript error, shows its best-effort plugin attribution, local date and time, and crash-reason history, and copies the unchanged error stack. It displays "None Recorded" when no crash has been saved. On the next load after an attributable fatal JavaScript error, the manager disables the implicated feature toggle and restarts only that plugin. Clear All removes saved crash records and pending recovery actions.
- A settings button for opening the installed plugin's own settings.
- An information/action menu with the plugin description and available plugin actions. Installed plugins offer Configure (when supported), Refetch, Copy URL, update controls, Clear Data, and Delete. Uninstalled plugins can be installed from the menu.
- An Install or Delete button using Revenge's plugin manager. Installed plugins continue to appear in Revenge's normal Plugins list.

The catalog includes Omniscience, Sage Eyes, Aura Control, Ephemeral Entity, and this manager plugin. Sage Eyes can also retain deleted messages and show previous edited text for the current session. Vencord plugins are not listed because they run on a different client and cannot be installed by Revenge.

Maintained by tenshiavi.
