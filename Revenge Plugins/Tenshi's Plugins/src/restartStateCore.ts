export type PendingManagerRestart = {
	sessionId: string;
	updatedAt: number;
	pluginNames: string[];
};

export function addPendingRestart(
	existing: PendingManagerRestart | undefined,
	pluginName: string,
	sessionId: string,
	updatedAt: number,
): PendingManagerRestart {
	return {
		sessionId,
		updatedAt,
		pluginNames: [...new Set([...(existing?.pluginNames ?? []), pluginName])],
	};
}

export function isPendingRestartFromPreviousSession(
	pending: PendingManagerRestart | undefined,
	currentSessionId: string,
) {
	return Boolean(pending && pending.sessionId !== currentSessionId);
}

export function needsManagerRestart(pluginName: string, bundleChanged: boolean, wasEnabled: boolean) {
	return pluginName === "Tenshi's Plugins" && bundleChanged && wasEnabled;
}