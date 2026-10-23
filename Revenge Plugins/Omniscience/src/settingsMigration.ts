const SETTINGS_VERSION = 7;

export function migrateOmniscienceSettings(storage: Record<string, unknown>) {
	if (storage.omniscienceSettingsVersion === SETTINGS_VERSION) return;
	if (storage.wordTrackerEnabled === undefined) {
		storage.wordTrackerEnabled = storage.enabled !== false;
	}
	if (storage.enableMessageHistory === false) {
		storage.keepDeletedMessages ??= false;
	}
	delete storage.enableMessageHistory;
	if (storage.keepEditHistory === undefined && storage.messageLoggerShowEditHistory !== undefined) {
		storage.keepEditHistory = storage.messageLoggerShowEditHistory;
	}
	delete storage.messageLoggerShowEditHistory;
	storage.keepEditHistory ??= true;
	delete storage.messageLoggerEditCount;
	if (Number(storage.messageLoggerLimit) === 500) storage.messageLoggerLimit = 512;
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
	]) delete storage[key];
	storage.enabled = true;
	storage.omniscienceSettingsVersion = SETTINGS_VERSION;
}