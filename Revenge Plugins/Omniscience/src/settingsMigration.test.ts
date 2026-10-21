import { expect, test } from "bun:test";
import { migrateOmniscienceSettings } from "./settingsMigration";

test("migrates the previous master toggle into Word Tracker and enables the plugin", () => {
	const storage: Record<string, unknown> = { enabled: false };
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(false);
	expect(storage.enabled).toBe(true);
	expect(storage.omniscienceSettingsVersion).toBe(2);
});

test("defaults new installations to enabled Word Tracker and plugin", () => {
	const storage: Record<string, unknown> = {};
	migrateOmniscienceSettings(storage);
	expect(storage.wordTrackerEnabled).toBe(true);
	expect(storage.enabled).toBe(true);
});

test("does not overwrite settings after migration", () => {
	const storage: Record<string, unknown> = {
		enabled: false,
		wordTrackerEnabled: true,
		omniscienceSettingsVersion: 2,
	};
	migrateOmniscienceSettings(storage);
	expect(storage.enabled).toBe(false);
	expect(storage.wordTrackerEnabled).toBe(true);
});