export type ManagedPlugin = {
	name: string;
	description: string;
	searchTerms: string;
	url: string;
	legacyUrls: string[];
};

const PUBLISHED_ROOT = "https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugins";
const LEGACY_ROOTS = [
	"https://tenshiavi1.github.io/Discord-Plugins/Revenge%20Plugin",
	"https://tenshiavi1.github.io/Plugins/Revenge%20Plugins",
	"https://tenshiavi1.github.io/Plugins/Revenge%20Plugin",
];
const GITHUB_CONTENTS_URL =
	"https://api.github.com/repos/tenshiavi1/Discord-Plugins/contents/Revenge%20Plugins?ref=main";
const GITHUB_RAW_ROOT =
	"https://raw.githubusercontent.com/tenshiavi1/Discord-Plugins/main/Revenge%20Plugins";

const PLUGIN_SEARCH_TERMS: Record<string, string> = {
	"Aura Control": "rich presence custom rpc activity application id application name connect disconnect update presence playing streaming listening watching competing display name state details urls twitch youtube party size maximum timestamp since connection startup local time custom start end large image small image image asset key hover text buttons button labels urls activity sharing",
	"Ephemeral Entity": "anonymize anonymise upload uploads attachment file filename file name random randomized length consistent replacement name remove tracking parameters tracking url query strings send edit message silent leave leave group dm command silent typing typing status hide typing",
	Omniscience: "keyword keywords phrase keyword tracking track monitor messages message create server servers guild group groups group dm direct message friends custom users ids ignore bots embeds channel channels webhook webhooks local notifications tracking target exact match whole words case sensitive in sentence imports export json",
	"Sage Eyes": "hidden channels inaccessible channel access lock icon popup view anyway permissions general logger deleted messages edit edited message history deleted message history retain logs ignore bot own messages ignored users timestamps cleanup cleanup actions feature toggle",
	"Tenshi's Plugins": "plugin manager install remove delete refetch fetch all restart search configure settings actions clear data crash logs",
};

function catalogEntry(name: string, description: string, directoryName = name): ManagedPlugin {
	const encodedName = encodeURIComponent(directoryName);
	return {
		name,
		description,
		searchTerms: PLUGIN_SEARCH_TERMS[name] ?? "",
		url: `${PUBLISHED_ROOT}/${encodedName}/`,
		legacyUrls: LEGACY_ROOTS.map((root) => `${root}/${encodedName}/`),
	};
}

export async function discoverManagedPlugins(): Promise<ManagedPlugin[]> {
	const directoryResponse = await fetch(GITHUB_CONTENTS_URL, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!directoryResponse.ok) {
		throw new Error(`GitHub returned ${directoryResponse.status} while listing Revenge plugins.`);
	}

	const directoryEntries: unknown = await directoryResponse.json();
	if (!Array.isArray(directoryEntries)) {
		throw new Error("GitHub returned an invalid Revenge plugin directory listing.");
	}

	const pluginDirectories = directoryEntries.filter(
		(entry): entry is { name: string; type: "dir" } =>
			typeof entry === "object" &&
			entry !== null &&
			"type" in entry &&
			entry.type === "dir" &&
			"name" in entry &&
			typeof entry.name === "string",
	);
	if (pluginDirectories.length === 0) {
		throw new Error("No Revenge plugin directories were found in the repository.");
	}

	return Promise.all(pluginDirectories.map(async ({ name }) => {
		const manifestUrl = `${GITHUB_RAW_ROOT}/${encodeURIComponent(name)}/manifest.json`;
		const manifestResponse = await fetch(manifestUrl);
		if (!manifestResponse.ok) {
			throw new Error(`GitHub returned ${manifestResponse.status} for the ${name} plugin manifest.`);
		}
		const manifest: unknown = await manifestResponse.json();
		if (
			typeof manifest !== "object" ||
			manifest === null ||
			!("name" in manifest) ||
			typeof manifest.name !== "string"
		) {
			throw new Error(`The ${name} plugin has an invalid manifest.`);
		}
		const description =
			"description" in manifest && typeof manifest.description === "string"
				? manifest.description
				: "No description available.";
		return catalogEntry(manifest.name, description, name);
	}));
}

export const MANAGED_PLUGINS: ManagedPlugin[] = [
	catalogEntry("Aura Control", "Configure a custom Discord Rich Presence from Revenge mobile."),
	catalogEntry("Ephemeral Entity", "Anonymize uploaded filenames and optionally clean tracking parameters from sent URLs."),
	catalogEntry("Omniscience", "Track configured keywords and optionally notify a channel or webhook."),
	catalogEntry("Sage Eyes", "Inspect hidden channels and configure deleted-message and edit-history logs, styling, and cleanup actions."),
	catalogEntry("Tenshi's Plugins", "Browse and manage tenshiavi's Revenge plugins from main settings."),
];
