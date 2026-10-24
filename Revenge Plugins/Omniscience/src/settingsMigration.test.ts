import { expect, test } from "bun:test";
import { migrateOmniscienceSettings } from "./settingsMigration";

test("migrates the previous master toggle into Word Tracker and enables the plugin", () => {
	const storage: Record<string, unknown> = { enabled: false };
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(false);
	expect(storage.enabled).toBe(true);
	expect(storage.omniscienceSettingsVersion).toBe(7);
});

test("defaults new installations to enabled Word Tracker and plugin", () => {
	const storage: Record<string, unknown> = {};
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(true);
	expect(storage.enabled).toBe(true);
});

test("migrates disabled legacy message history to Omniscience switches", () => {
	const storage: Record<string, unknown> = {
		enabled: true,
		enableMessageHistory: false,
		omniscienceSettingsVersion: 2,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.keepDeletedMessages).toBe(false);
	expect(storage.keepEditHistory).toBe(true);
	expect(storage.enableMessageHistory).toBeUndefined();
	expect(storage.omniscienceSettingsVersion).toBe(7);
});

test("removes retired DM and forwarded message logger settings", () => {
	const storage: Record<string, unknown> = {
		omniscienceSettingsVersion: 5,
		dmLoggerEnabled: true,
		dmLoggerWebhookUrl: "https://example.com",
		messageLoggerEnabled: true,
		messageLoggerSourceChannelId: "123",
		messageLoggerLimit: 500,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.dmLoggerEnabled).toBeUndefined();
	expect(storage.dmLoggerWebhookUrl).toBeUndefined();
	expect(storage.messageLoggerEnabled).toBeUndefined();
	expect(storage.messageLoggerSourceChannelId).toBeUndefined();
	expect(storage.messageLoggerLimit).toBe(512);
	expect(storage.omniscienceSettingsVersion).toBe(7);
});

test("removes retired logger caches while preserving the account history archive", () => {
	const storage: Record<string, unknown> = {
		omniscienceSettingsVersion: 5,
		keepEditHistory: true,
		messageLoggerEditCount: 2,
		messageLoggerCache: [{ id: "1", editHistory: [{ content: "old" }] }],
		messageLoggerDeletedCache: [{ id: "2", editHistory: [{ content: "old" }] }],
		omniscienceMessageHistory: {
			deleted: [{ id: "3" }],
			edits: [{ messageId: "4", versions: [{ content: "old" }] }],
		},
	};

	migrateOmniscienceSettings(storage);

	expect(storage.keepEditHistory).toBe(true);
	expect(storage.messageLoggerEditCount).toBeUndefined();
	expect(storage.messageLoggerCache).toBeUndefined();
	expect(storage.messageLoggerDeletedCache).toBeUndefined();
	expect(storage.omniscienceMessageHistory).toEqual({
		deleted: [{ id: "3" }],
		edits: [{ messageId: "4", versions: [{ content: "old" }] }],
	});
});

test("does not overwrite settings after migration", () => {
	const storage: Record<string, unknown> = {
		enabled: false,
		wordTrackerEnabled: true,
		omniscienceSettingsVersion: 7,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.enabled).toBe(false);
	expect(storage.wordTrackerEnabled).toBe(true);
});

test("removes retired logger caches from already-migrated settings", () => {
	const storage: Record<string, unknown> = {
		omniscienceSettingsVersion: 7,
		messageLoggerCache: [{ id: "1" }],
		messageLoggerDeletedCache: [{ id: "2" }],
	};

	migrateOmniscienceSettings(storage);

	expect(storage.messageLoggerCache).toBeUndefined();
	expect(storage.messageLoggerDeletedCache).toBeUndefined();
});