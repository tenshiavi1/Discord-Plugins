const SETTINGS_VERSION = 4;

export function migrateOmniscienceSettings(storage: Record<string, unknown>) {
	if (storage.omniscienceSettingsVersion === SETTINGS_VERSION) return;
	if (storage.wordTrackerEnabled === undefined) {
		storage.wordTrackerEnabled = storage.enabled !== false;
	}
	if (storage.enableMessageHistory === false) {
		storage.keepDeletedMessages ??= false;
		storage.keepEditHistory ??= false;
	}
	delete storage.enableMessageHistory;
	for (const key of [
		"dmLoggerEnabled",
		"dmLoggerSendToChannel",
		"dmLoggerSendToWebhook",
		"dmLoggerChannelId",
		"dmLoggerWebhookUrl",
		"messageLoggerEnabled",
		"messageLoggerSendToChannel",
		"messageLoggerSendToWebhook",
		"messageLoggerSourceChannelId",
		"messageLoggerDestinationChannelId",
		"messageLoggerWebhookUrl",
		"messageLoggerLimit",
	]) delete storage[key];
	storage.enabled = true;
	storage.omniscienceSettingsVersion = SETTINGS_VERSION;
}