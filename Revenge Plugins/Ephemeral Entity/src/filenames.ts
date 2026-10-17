export type AnonymizationMethod = "random" | "consistent" | "timestamp";

export const METHODS: { label: string; value: AnonymizationMethod }[] = [
	{ label: "Random Characters", value: "random" },
	{ label: "Consistent Name", value: "consistent" },
	{ label: "Timestamp", value: "timestamp" },
];

export type FilenameSettings = {
	method: AnonymizationMethod;
	randomizedLength: number;
	consistentName: string;
};

const RANDOM_CHARACTERS = "0123456789bdfhjkmnpqrstvwxz";
const TAR_EXTENSION = /\.tar\.\w+$/i;
let previousTimestamp = 0;

function nextTimestamp(): number {
	previousTimestamp = Math.max(Date.now(), previousTimestamp + 1);
	return previousTimestamp;
}

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

function getUploadName(value: unknown, depth = 0): string | undefined {
	if (!value || typeof value !== "object" || depth > 3) return undefined;
	if (typeof File === "function" && value instanceof File) return value.name;
	if (typeof Blob === "function" && value instanceof Blob) return "file";
	const upload = value as Record<string, unknown>;
	if (typeof upload.filename === "string") return upload.filename;
	if (typeof upload.name === "string") return upload.name;
	return getUploadName(upload.file, depth + 1);
}

function setUploadProperty(upload: Record<string, unknown>, key: string, value: unknown): boolean {
	try {
		upload[key] = value;
	} catch {}
	if (upload[key] === value) return true;

	const descriptor = Object.getOwnPropertyDescriptor(upload, key);
	if (!descriptor || descriptor.configurable) {
		try {
			Object.defineProperty(upload, key, {
				configurable: true,
				enumerable: descriptor?.enumerable ?? true,
				writable: true,
				value,
			});
		} catch {
			return false;
		}
	}
	return upload[key] === value;
}

function renameUploadValue(value: unknown, name: string, depth = 0): unknown {
	if (!value || typeof value !== "object" || depth > 3) return value;
	if (typeof Blob === "function" && value instanceof Blob) {
		if (typeof File !== "function") throw new Error("The File constructor is unavailable.");
		const lastModified = value instanceof File ? value.lastModified : Date.now();
		return new File([value], name, { type: value.type, lastModified });
	}

	const upload = value as Record<string, unknown>;
	if (typeof upload.filename === "string" && !setUploadProperty(upload, "filename", name)) {
		throw new Error("The upload filename is read-only.");
	}
	if (typeof upload.name === "string" && !setUploadProperty(upload, "name", name)) {
		throw new Error("The file name is read-only.");
	}
	if (upload.file && typeof upload.file === "object") {
		const renamedFile = renameUploadValue(upload.file, name, depth + 1);
		if (renamedFile !== upload.file && !setUploadProperty(upload, "file", renamedFile)) {
			throw new Error("The nested file cannot be replaced.");
		}
	}
	return value;
}

export function anonymizeUploadFiles(files: unknown, settings: FilenameSettings): boolean {
	if (!Array.isArray(files)) return false;

	for (let index = 0; index < files.length; index++) {
		const file = files[index];
		if (file == null) continue;
		if (typeof file !== "object") return false;
		const filename = getUploadName(file);
		if (!filename) return false;
		try {
			const now = settings.method === "timestamp" ? nextTimestamp() : Date.now();
			files[index] = renameUploadValue(file, anonymizeFilename(filename, settings, now));
		} catch (error) {
			console.warn("[Ephemeral Entity] Could not anonymize an uploaded file name.", error);
			return false;
		}
	}
	return true;
}
