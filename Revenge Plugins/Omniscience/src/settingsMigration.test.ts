import { expect, test } from "bun:test";
import { migrateOmniscienceSettings } from "./settingsMigration";

test("migrates the previous master toggle into Word Tracker and enables the plugin", () => {
	const storage: Record<string, unknown> = { enabled: false };
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(false);
	expect(storage.enabled).toBe(true);
	expect(storage.omniscienceSettingsVersion).toBe(6);
});

test("defaults new installations to enabled Word Tracker and plugin", () => {
	const storage: Record<string, unknown> = {};
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(true);
	expect(storage.enabled).toBe(true);
});

test("migrates disabled legacy message history to both Venus-style switches", () => {
	const storage: Record<string, unknown> = {
		enabled: true,
		enableMessageHistory: false,
		omniscienceSettingsVersion: 2,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.keepDeletedMessages).toBe(false);
	expect(storage.keepEditHistory).toBeUndefined();
	expect(storage.enableMessageHistory).toBeUndefined();
	expect(storage.omniscienceSettingsVersion).toBe(6);
});

test("removes retired DM and forwarded message logger settings", () => {
	const storage: Record<string, unknown> = {
		omniscienceSettingsVersion: 5,
		dmLoggerEnabled: true,
		dmLoggerWebhookUrl: "https://example.com",
		messageLoggerEnabled: true,
		messageLoggerSourceChannelId: "123",
		messageLoggerLimit: 512,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.dmLoggerEnabled).toBeUndefined();
	expect(storage.dmLoggerWebhookUrl).toBeUndefined();
	expect(storage.messageLoggerEnabled).toBeUndefined();
	expect(storage.messageLoggerSourceChannelId).toBeUndefined();
	expect(storage.messageLoggerLimit).toBe(500);
	expect(storage.omniscienceSettingsVersion).toBe(6);
});

test("removes saved edit-history data while preserving deleted messages", () => {
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

	expect(storage.keepEditHistory).toBeUndefined();
	expect(storage.messageLoggerEditCount).toBeUndefined();
	expect(storage.messageLoggerCache).toEqual([{ id: "1" }]);
	expect(storage.messageLoggerDeletedCache).toEqual([{ id: "2" }]);
	expect(storage.omniscienceMessageHistory).toEqual({ deleted: [{ id: "3" }] });
});

test("does not overwrite settings after migration", () => {
	const storage: Record<string, unknown> = {
		enabled: false,
		wordTrackerEnabled: true,
		omniscienceSettingsVersion: 6,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.enabled).toBe(false);
	expect(storage.wordTrackerEnabled).toBe(true);
});