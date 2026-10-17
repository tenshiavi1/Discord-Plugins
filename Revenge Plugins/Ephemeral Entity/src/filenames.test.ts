import { expect, test } from "bun:test";
import { anonymizeFilename, anonymizeUploadFiles, getFileExtension } from "./filenames";

const settings = {
	method: "consistent" as const,
	randomizedLength: 7,
	consistentName: "private",
};

test("anonymizes names across media, document, archive, and extensionless files", () => {
	for (const filename of ["photo.png", "clip.mp4", "voice.mp3", "report.pdf", "archive.tar.gz", "README"]) {
		expect(anonymizeFilename(filename, settings)).toBe(`private${getFileExtension(filename)}`);
	}
});

test("replaces native File objects and preserves their content metadata", () => {
	const source = new File(["document contents"], "report.pdf", { type: "application/pdf", lastModified: 123 });
	const files: unknown[] = [source];

	expect(anonymizeUploadFiles(files, settings)).toBe(true);

	expect(files[0]).toBeInstanceOf(File);
	expect(files[0]).not.toBe(source);
	expect((files[0] as File).name).toBe("private.pdf");
	expect((files[0] as File).type).toBe(source.type);
	expect((files[0] as File).lastModified).toBe(source.lastModified);
	expect((files[0] as File).size).toBe(source.size);
});

test("converts unnamed Blob uploads to named files without changing their content", () => {
	const source = new Blob(["audio contents"], { type: "audio/ogg" });
	const files: unknown[] = [source];

	expect(anonymizeUploadFiles(files, settings)).toBe(true);
	expect(files[0]).toBeInstanceOf(File);
	expect((files[0] as File).name).toBe("private");
	expect((files[0] as File).type).toBe("audio/ogg");
	expect((files[0] as File).size).toBe(source.size);
});

test("renames mutable upload records and nested native files consistently", () => {
	const nestedFile = new File(["image contents"], "camera.jpeg", { type: "image/jpeg" });
	const files = [
		{ uri: "file://video.webm", name: "video.webm" },
		{ filename: "camera.jpeg", file: nestedFile },
	];

	expect(anonymizeUploadFiles(files, settings)).toBe(true);

	expect(files[0].name).toBe("private.webm");
	expect(files[1].filename).toBe("private.jpeg");
	expect(files[1].file).toBeInstanceOf(File);
	expect(files[1].file.name).toBe("private.jpeg");
});

test("uses distinct timestamps for files in the same batch", () => {
	const files = [{ filename: "first.pdf" }, { filename: "second.docx" }, { filename: "third.txt" }];
	const timestampSettings = { ...settings, method: "timestamp" as const };

	expect(anonymizeUploadFiles(files, timestampSettings)).toBe(true);
	expect(new Set(files.map((file) => file.filename)).size).toBe(files.length);
	expect(files.map((file) => getFileExtension(file.filename))).toEqual([".pdf", ".docx", ".txt"]);
});

test("rejects upload entries that cannot be anonymized", () => {
	expect(anonymizeUploadFiles(undefined, settings)).toBe(false);
	expect(anonymizeUploadFiles([{ uri: "file://missing-name" }], settings)).toBe(false);
});