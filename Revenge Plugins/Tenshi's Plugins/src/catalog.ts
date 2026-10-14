export type ManagedPlugin = {
	name: string;
	description: string;
	url: string;
	legacyUrls: string[];
};

const PUBLISHED_ROOT = "https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins";
const LEGACY_ROOTS = [
	"https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugin",
	"https://tenshiavi1.github.io/Plugins/Revenge%20Plugins",
	"https://tenshiavi1.github.io/Plugins/Revenge%20Plugin",
];

function catalogEntry(name: string, description: string): ManagedPlugin {
	const encodedName = encodeURIComponent(name);
	return {
		name,
		description,
		url: `${PUBLISHED_ROOT}/${encodedName}/`,
		legacyUrls: LEGACY_ROOTS.map((root) => `${root}/${encodedName}/`),
	};
}

export const MANAGED_PLUGINS: ManagedPlugin[] = [
	catalogEntry("Aura Control", "Configure a custom Discord Rich Presence from Revenge mobile."),
	catalogEntry("Ephemeral Entity", "Anonymize uploaded filenames and optionally clean tracking parameters from sent URLs."),
	catalogEntry("Omniscience", "Track configured keywords and optionally notify a channel or webhook."),
	catalogEntry("Sage Eyes", "Show and inspect hidden or obscured channels in Revenge."),
	catalogEntry("Tenshi's Plugins", "Browse and manage tenshiavi's Revenge plugins from main settings."),
];
