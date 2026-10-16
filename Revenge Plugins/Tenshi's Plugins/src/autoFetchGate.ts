export type AutoFetchStartupState = {
	startupHandled: boolean;
};

export type AutoFetchProgress = {
	phase: "scheduled" | "loading" | "updating";
	completed: number;
	total: number;
	pluginName: string;
};

export function formatAutoFetchProgress(progress: AutoFetchProgress | undefined) {
	if (!progress) return "Updating plugins…";
	if (progress.phase === "scheduled") return "Starting automatic updates…";
	if (progress.phase === "loading") return "Loading plugin list…";
	return progress.pluginName
		? `Updating ${progress.pluginName} (${progress.completed}/${progress.total})…`
		: `Updating plugins (${progress.completed}/${progress.total})…`;
}

export function claimAutoFetchStartup(state: AutoFetchStartupState, enabled: boolean): boolean {
	if (state.startupHandled) return false;
	state.startupHandled = true;
	return enabled;
}