const SETTINGS_VERSION = 6;

export function migrateOmniscienceSettings(storage: Record<string, unknown>) {
	if (storage.omniscienceSettingsVersion === SETTINGS_VERSION) return;
	if (storage.wordTrackerEnabled === undefined) {
		storage.wordTrackerEnabled = storage.enabled !== false;
	}
	if (storage.enableMessageHistory === false) {
		storage.keepDeletedMessages ??= false;
	}
	delete storage.enableMessageHistory;
	delete storage.keepEditHistory;
	delete storage.messageLoggerShowEditHistory;
	delete storage.messageLoggerEditCount;
	for (const key of ["messageLoggerCache", "messageLoggerDeletedCache"]) {
		if (!Array.isArray(storage[key])) continue;
		storage[key] = (storage[key] as Record<string, unknown>[]).map((entry) => {
			const cleaned = { ...entry };
			delete cleaned.editHistory;
			return cleaned;
		});
	}
	const messageHistory = storage.omniscienceMessageHistory;
	if (messageHistory && typeof messageHistory === "object" && !Array.isArray(messageHistory)) {
		const cleaned: Record<string, unknown> = { ...messageHistory };
		delete cleaned.edits;
		storage.omniscienceMessageHistory = cleaned;
	}
	if (Number(storage.messageLoggerLimit) === 512) storage.messageLoggerLimit = 500;
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