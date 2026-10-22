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
];
const GITHUB_CONTENTS_URL =
	"https://api.github.com/repos/tenshiavi1/Discord-Plugins/contents/Revenge%20Plugins?ref=main";
const GITHUB_RAW_ROOT =
	"https://raw.githubusercontent.com/tenshiavi1/Discord-Plugins/main/Revenge%20Plugins";

export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
	const maxAttempts = 3;
	let lastError: unknown;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let response: Response | undefined;
		const separator = url.includes("?") ? "&" : "?";
		const requestUrl = `${url}${separator}_fetch=${Date.now()}-${attempt}`;
		try {
			const request = fetch(requestUrl, init);
			response = await Promise.race([
				request,
				new Promise<Response>((_, reject) => {
					timeout = setTimeout(() => {
						reject(new Error(`Request timed out after 12 seconds: ${url}`));
					}, 12_000);
				}),
			]);
		} catch (error) {
			lastError = error;
		} finally {
			if (timeout !== undefined) clearTimeout(timeout);
		}

		if (response?.ok) return response;
		if (response) {
			lastError = new Error(`Request for ${url} returned HTTP ${response.status}.`);
			if (response.status !== 408 && response.status !== 429 && response.status < 500) {
				throw lastError;
			}
		}

		if (attempt < maxAttempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
		}
	}

	const message = lastError instanceof Error ? lastError.message : String(lastError);
	throw new Error(`Could not fetch ${url} after ${maxAttempts} attempts: ${message}`);
}

const PLUGIN_SEARCH_TERMS: Record<string, string> = {
	"Aura Control": "rich presence custom rpc activity application id application name connect disconnect update presence playing streaming listening watching competing display name state details urls twitch youtube party size maximum timestamp since connection startup local time custom start end large image small image image asset key hover text buttons button labels urls activity sharing",
	"Ephemeral Entity": "anonymize anonymise upload uploads attachment file filename file name random randomized length consistent replacement name remove tracking parameters tracking url query strings send edit message silent leave leave group dm command silent typing typing status hide typing",
	Omniscience: "keyword keywords phrase keyword tracking track monitor messages message create server servers guild group groups group dm direct message friends custom users ids ignore bots embeds mention mentions pings active account current account channel channels webhook webhooks local notifications tracking target exact match whole words case sensitive in sentence imports export json delete deleted messages message history edit history server info guild details server id owner member count online count roles boosts creation date vanity url description deleted edit logs ignore bot own messages ignored users timestamps cleanup actions",
	"Tenshi's Plugins": "plugin manager install remove delete refetch fetch all restart search configure settings actions clear data crash logs developer mode developer settings copy id ids advanced discord appearance",
	"Avatar Handler": "avatar handler multiple accounts alts account switcher switch accounts account manager native saved accounts discord mobile authenticator two factor authentication 2fa login confirmation",
	"God Console": "readall slash command mark unread read all server channels direct messages jump to top mentions unknown user valid user resolve mentions add attachments addattachment message edit upload files",
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
	const directoryResponse = await fetchWithRetry(GITHUB_CONTENTS_URL, {
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
			typeof entry.name === "string" &&
			entry.name !== "shared",
	);
	if (pluginDirectories.length === 0) {
		throw new Error("No Revenge plugin directories were found in the repository.");
	}

	return Promise.all(pluginDirectories.map(async ({ name }) => {
		const manifestUrl = `${GITHUB_RAW_ROOT}/${encodeURIComponent(name)}/manifest.json`;
		const manifestResponse = await fetchWithRetry(manifestUrl);
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
	catalogEntry("Aura Control", "Create and manage a custom Discord Rich Presence in Revenge."),
	catalogEntry("Avatar Handler", "Use Discord's native account switcher for accounts already saved on your device."),
	catalogEntry("Ephemeral Entity", "Anonymize uploaded file names, remove tracking parameters from sent URLs, hide typing status, and leave group DMs silently."),
	catalogEntry("God Console", "Mark channels as read, jump to chat history, resolve uncached mentions, and add files to your messages."),
	catalogEntry("Omniscience", "Track message keywords and active-account mentions, with optional channel or webhook alerts."),
	catalogEntry("Tenshi's Plugins", "Manage Revenge plugins, keep Developer Mode enabled, and review crash diagnostics."),
];
