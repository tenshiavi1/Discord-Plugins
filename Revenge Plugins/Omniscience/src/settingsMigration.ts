const SETTINGS_VERSION = 2;

export function migrateOmniscienceSettings(storage: Record<string, unknown>) {
	if (storage.omniscienceSettingsVersion === SETTINGS_VERSION) return;
	if (storage.wordTrackerEnabled === undefined) {
		storage.wordTrackerEnabled = storage.enabled !== false;
	}
	storage.enabled = true;
	storage.omniscienceSettingsVersion = SETTINGS_VERSION;
}