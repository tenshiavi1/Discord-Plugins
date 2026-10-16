import type { ManagerActivityRecord } from "./activityLog";

export type ActivityConsoleSummary = {
	errorCount: number;
	latestErrorTimestamp?: number;
	installedPlugins: number;
	repositoryPlugins: number;
	updatedPlugins: number;
	updateTotal: number;
};

export type ActivityConsoleAction = "fetch" | "install" | "remove" | "clear" | "auto-fetch";
export type ActivityConsolePhase = "running" | "complete" | "failed";

export type ActivityConsoleState = {
	action: ActivityConsoleAction;
	phase: ActivityConsolePhase;
	current: number;
	total: number;
	errors: number;
	installedCount: number;
	repositoryCount: number;
	updatedCount: number;
	updatedTotal: number;
	restartRequired: boolean;
};

export function formatActivityConsoleHeader(state: ActivityConsoleState) {
	const restartAdvice = state.restartRequired ? " Restart required." : "";
	if (state.phase === "running") {
		const progress = `${state.current} / ${state.total}`;
		switch (state.action) {
			case "fetch": return `Fetching plugin list. ${progress}`;
			case "install": return `Installing all plugins. ${progress}`;
			case "remove": return `Removing all plugins. ${progress}`;
			case "clear": return `Clearing plugin data. ${progress}`;
			case "auto-fetch": return `Auto-updating plugin list. ${progress}`;
		}
	}

	if (state.phase === "failed") {
		const action = state.action === "fetch" || state.action === "auto-fetch"
			? "fetch plugin list"
			: state.action === "install" ? "install plugins"
				: state.action === "remove" ? "remove plugins" : "clear plugin data";
		return `Could not ${action}. ${state.errors} error${state.errors === 1 ? "" : "s"}.${restartAdvice}`;
	}

	const completion = {
		fetch: "Fetched plugin list.",
		install: "Installed all plugins.",
		remove: "Removed all plugins.",
		clear: "Cleared all plugin data.",
		"auto-fetch": "Auto-updated plugin list.",
	}[state.action];
	return `${completion}${restartAdvice}`;
}

export function summarizeActivityConsole(
	records: ManagerActivityRecord[],
	installedPlugins: number,
	repositoryPlugins: number,
): ActivityConsoleSummary {
	const failedRecords = records.filter((record) => record.status === "failure");
	const aggregateFailure = failedRecords.find((record) =>
		/(?:finished with|\b)(\d+) (?:failures?|errors?)\b/i.test(record.summary),
	);
	const aggregateCount = aggregateFailure?.summary.match(/(?:finished with|\b)(\d+) (?:failures?|errors?)\b/i)?.[1];
	const latestErrorTimestamp = failedRecords.reduce<number | undefined>(
		(latest, record) => latest === undefined || record.timestamp > latest ? record.timestamp : latest,
		undefined,
	);
	const latestMetrics = records.find((record) => record.metrics)?.metrics;
	return {
		errorCount: aggregateCount ? Number(aggregateCount) : failedRecords.length,
		latestErrorTimestamp,
		installedPlugins,
		repositoryPlugins,
		updatedPlugins: latestMetrics?.updatedPlugins ?? 0,
		updateTotal: latestMetrics?.updateTotal ?? installedPlugins,
	};
}

export function formatLocalErrorTime(timestamp: number | undefined) {
	if (timestamp === undefined) return "None";
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
	});
}

export function formatLatestError(timestamp: number | undefined) {
	if (timestamp === undefined) return "None";
	return `${new Date(timestamp).toLocaleDateString()} ${formatLocalErrorTime(timestamp)}`;
}