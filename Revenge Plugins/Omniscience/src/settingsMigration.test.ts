import { expect, test } from "bun:test";
import { migrateOmniscienceSettings } from "./settingsMigration";

test("migrates the previous master toggle into Word Tracker and enables the plugin", () => {
	const storage: Record<string, unknown> = { enabled: false };
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(false);
	expect(storage.enabled).toBe(true);
	expect(storage.omniscienceSettingsVersion).toBe(5);
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
	expect(storage.keepEditHistory).toBe(false);
	expect(storage.enableMessageHistory).toBeUndefined();
	expect(storage.omniscienceSettingsVersion).toBe(5);
});

test("removes retired DM and forwarded message logger settings", () => {
	const storage: Record<string, unknown> = {
		omniscienceSettingsVersion: 3,
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
	expect(storage.omniscienceSettingsVersion).toBe(5);
});

test("does not overwrite settings after migration", () => {
	const storage: Record<string, unknown> = {
		enabled: false,
		wordTrackerEnabled: true,
		omniscienceSettingsVersion: 5,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.enabled).toBe(false);
	expect(storage.wordTrackerEnabled).toBe(true);
});