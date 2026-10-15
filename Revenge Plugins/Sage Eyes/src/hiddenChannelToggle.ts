let updateHiddenChannelFeature: ((enabled: boolean) => void) | undefined;

export function registerHiddenChannelFeatureToggle(update: (enabled: boolean) => void) {
	updateHiddenChannelFeature = update;
}

export function setHiddenChannelFeatureEnabled(enabled: boolean) {
	updateHiddenChannelFeature?.(enabled);
}
