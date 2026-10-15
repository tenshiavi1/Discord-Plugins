# Plugins by tenshiavi

This repository groups plugins by client platform.

## Revenge Plugins

Mobile plugins compatible with Revenge:

- [Aura Control](./Revenge%20Plugins/Aura%20Control/README.md) — Create and manage custom Rich Presence.
- [Ephemeral Entity](./Revenge%20Plugins/Ephemeral%20Entity/README.md) — Anonymize uploads, clean tracking URLs, hide typing, and leave group DMs silently.
- [Omniscience](./Revenge%20Plugins/Omniscience/README.md) — Track keywords and mentions of your active account, with optional channel and webhook alerts.
- [Sage Eyes](./Revenge%20Plugins/Sage%20Eyes/README.md) — View hidden-channel details, server info, and local message edit/deletion history.
- [Tenshi's Plugins](./Revenge%20Plugins/Tenshi's%20Plugins/README.md) — Manage Revenge plugins, keep Developer Mode on, and review crash reports.
- [Avatar Handler](./Revenge%20Plugins/Avatar%20Handler/README.md) — Unlock Discord's native mobile account switcher for saved accounts.
- [God Console](./Revenge%20Plugins/God%20Console/README.md) — Mark unread channels as read, jump to chat history, and repair unresolved mentions.

Add a plugin's integration URL in Revenge:

| Plugin | Integration URL |
| --- | --- |
| Aura Control | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Aura%20Control/` |
| Ephemeral Entity | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Ephemeral%20Entity/` |
| Omniscience | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Omniscience/` |
| Sage Eyes | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Sage%20Eyes/` |
| Tenshi's Plugins | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Tenshi's%20Plugins/` |
| Avatar Handler | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Avatar%20Handler/` |
| God Console | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/God%20Console/` |

The build also publishes the previous singular `Revenge%20Plugin` category path beneath the new repository URL for compatibility.

## Runtime compatibility

Each Revenge plugin bundle includes a shared module resolver. It prefers Revenge's normal
module lookups and falls back to capability- and name-based discovery when those lookups
change, logging when a fallback is used. This helps with module reshuffling, but cannot
automatically repair removed APIs or changed Discord behavior; those still require a plugin update.
Revenge plugin notifications use a shared toast helper with a 3-second display time and a
100-character limit to keep messages readable on mobile.

## Vencord Plugins

The [`Vencord Plugins`](./Vencord%20Plugins/README.md) folder is reserved for desktop Vencord plugins and their documentation. These will be maintained separately from the Revenge mobile build.

## Build and deployment

The root build script bundles Revenge plugins, and GitHub Actions publishes them to GitHub Pages after changes to `main`. Vencord plugins are not included in the Revenge bundle build.

## License

The project is released under CC0 1.0 Universal. See [LICENSE](./LICENSE).
