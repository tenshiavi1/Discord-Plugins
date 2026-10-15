export type AutoFetchStartupState = {
	startupHandled: boolean;
};

export function claimAutoFetchStartup(state: AutoFetchStartupState, enabled: boolean): boolean {
	if (state.startupHandled) return false;
	state.startupHandled = true;
	return enabled;
}