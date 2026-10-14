export type AnonymizationMethod = "random" | "consistent" | "timestamp";

export const METHODS: { label: string; value: AnonymizationMethod }[] = [
	{ label: "Random characters", value: "random" },
	{ label: "Consistent name", value: "consistent" },
	{ label: "Timestamp", value: "timestamp" },
];

export type FilenameSettings = {
	method: AnonymizationMethod;
	randomizedLength: number;
	consistentName: string;
};

const RANDOM_CHARACTERS = "0123456789bdfhjkmnpqrstvwxz";
const TAR_EXTENSION = /\.tar\.\w+$/i;

export function getFileExtension(filename: string): string {
	const tarMatch = TAR_EXTENSION.exec(filename);
	const extensionStart = tarMatch?.index ?? filename.lastIndexOf(".");
	return extensionStart === -1 ? "" : filename.slice(extensionStart);
}

export function anonymizeFilename(
	filename: string,
	settings: FilenameSettings,
	now = Date.now(),
	random: () => number = Math.random,
): string {
	const extension = getFileExtension(filename);
	let replacement: string;

	switch (settings.method) {
		case "consistent":
			replacement = settings.consistentName.trim() || "file";
			break;
		case "timestamp":
			replacement = String(now);
			break;
		case "random": {
			const length = Math.max(1, Math.min(64, Math.floor(settings.randomizedLength) || 7));
			replacement = Array.from({ length }, () => {
				const index = Math.min(
					RANDOM_CHARACTERS.length - 1,
					Math.floor(random() * RANDOM_CHARACTERS.length),
				);
				return RANDOM_CHARACTERS[index];
			}).join("");
			break;
		}
		default:
			return filename;
	}

	return `${replacement}${extension}`;
}

export function anonymizeUploadFiles(files: unknown, settings: FilenameSettings): void {
	if (!Array.isArray(files)) return;

	for (const file of files) {
		if (!file || typeof file !== "object") continue;

		const upload = file as { filename?: unknown; name?: unknown };
		if (typeof upload.filename === "string") {
			upload.filename = anonymizeFilename(upload.filename, settings);
		} else if (typeof upload.name === "string") {
			upload.name = anonymizeFilename(upload.name, settings);
		}
	}
}
