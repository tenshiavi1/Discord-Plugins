let updateMessageHistoryFeature: ((enabled: boolean) => void) | undefined;

export function registerMessageHistoryFeatureToggle(update: (enabled: boolean) => void) {
	updateMessageHistoryFeature = update;
}

export function setMessageHistoryFeatureEnabled(enabled: boolean) {
	updateMessageHistoryFeature?.(enabled);
}
