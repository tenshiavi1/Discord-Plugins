# Plugins by tenshiavi

This repository groups plugins by client platform.

## Revenge Plugins

Mobile plugins compatible with Revenge:

- [Aura Control](./Revenge%20Plugins/Aura%20Control/README.md) — Create and manage a custom Discord Rich Presence in Revenge.
- [Avatar Handler](./Revenge%20Plugins/Avatar%20Handler/README.md) — Use Discord's native account switcher for accounts already saved on your device.
- [Ephemeral Entity](./Revenge%20Plugins/Ephemeral%20Entity/README.md) — Anonymize uploaded file names, remove tracking parameters from sent URLs, hide typing status, and leave group DMs silently.
- [God Console](./Revenge%20Plugins/God%20Console/README.md) — Mark channels as read, jump to chat history, resolve uncached mentions, and add files to your messages.
- [Omniscience](./Revenge%20Plugins/Omniscience/README.md) — Track message keywords and active-account mentions, with optional channel or webhook alerts.
- [Sage Eyes](./Revenge%20Plugins/Sage%20Eyes/README.md) — View client-visible details for hidden channels, inspect server information, and keep in-session message history.
- [Tenshi's Plugins](./Revenge%20Plugins/Tenshi's%20Plugins/README.md) — Manage Revenge plugins, keep Developer Mode enabled, and review crash diagnostics.

Add a plugin's integration URL in Revenge:

| Plugin | Integration URL |
| --- | --- |
| Aura Control | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Aura%20Control/` |
| Avatar Handler | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Avatar%20Handler/` |
| Ephemeral Entity | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Ephemeral%20Entity/` |
| God Console | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/God%20Console/` |
| Omniscience | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Omniscience/` |
| Sage Eyes | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Sage%20Eyes/` |
| Tenshi's Plugins | `https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins/Tenshi's%20Plugins/` |

The build also publishes the previous singular `Revenge%20Plugin` category path beneath the new repository URL for compatibility.

## Runtime Compatibility

Each Revenge plugin bundle includes a shared module resolver. It prefers Revenge's normal
module lookups and falls back to capability- and name-based discovery when those lookups
change, logging when a fallback is used. This helps with module reshuffling, but cannot
automatically repair removed APIs or changed Discord behavior; those still require a plugin update.
Revenge plugin notifications use a shared toast helper with a 3-second display time and a
100-character limit to keep messages readable on mobile.

## Vencord Plugins

The [`Vencord Plugins`](./Vencord%20Plugins/README.md) folder is reserved for desktop Vencord plugins and their documentation. These will be maintained separately from the Revenge mobile build.

## Build and Deployment

The root build script bundles Revenge plugins, and GitHub Actions publishes them to GitHub Pages after changes to `main`. Vencord plugins are not included in the Revenge bundle build.

## License

The project is released under CC0 1.0 Universal. See [LICENSE](./LICENSE).
