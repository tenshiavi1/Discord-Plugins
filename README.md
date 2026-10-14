# Plugins by tenshiavi

This repository groups plugins by client platform.

## Revenge Plugins

Mobile plugins compatible with Revenge:

- [Aura Control](./Revenge%20Plugins/Aura%20Control/README.md) — Configure a custom Rich Presence.
- [Ephemeral Entity](./Revenge%20Plugins/Ephemeral%20Entity/README.md) — Anonymize attachment filenames and optionally clean tracking parameters from sent URLs.
- [Omniscience](./Revenge%20Plugins/Omniscience/README.md) — Track configured keywords and optionally notify a channel or webhook.
- [Sage Eyes](./Revenge%20Plugins/Sage%20Eyes/README.md) — Inspect hidden channel details, retain deleted messages and edit history, and manage them with long-press actions.
- [Tenshi's Plugins](./Revenge%20Plugins/Tenshi's%20Plugins/README.md) — Browse, configure, install, and delete the Revenge plugins from main settings.

Add a plugin's integration URL in Revenge:

| Plugin | Integration URL |
| --- | --- |
| Aura Control | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Aura%20Control/` |
| Ephemeral Entity | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Ephemeral%20Entity/` |
| Omniscience | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Omniscience/` |
| Sage Eyes | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Sage%20Eyes/` |
| Tenshi's Plugins | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Tenshi's%20Plugins/` |

The build also publishes the previous singular `Revenge%20Plugin` category path beneath the new repository URL for compatibility.

## Vencord Plugins

The [`Vencord Plugins`](./Vencord%20Plugins/README.md) folder is reserved for desktop Vencord plugins and their documentation. These will be maintained separately from the Revenge mobile build.

## Build and deployment

The root build script bundles Revenge plugins, and GitHub Actions publishes them to GitHub Pages after changes to `main`. Vencord plugins are not included in the Revenge bundle build.

## License

The project is released under CC0 1.0 Universal. See [LICENSE](./LICENSE).
