import { expect, test } from "bun:test";
import {
	formatActivityConsoleHeader,
	formatLatestError,
	formatLocalErrorTime,
	summarizeActivityConsole,
	type ActivityConsoleState,
} from "./activityConsole";

test("summarizes failures and the latest error separately from update metrics", () => {
	const summary = summarizeActivityConsole([
		{ timestamp: 100, status: "failure", summary: "Fetch failed" },
		{
			timestamp: 300,
			status: "success",
			summary: "Fetch completed",
			metrics: { installedPlugins: 5, repositoryPlugins: 7, updatedPlugins: 2, updateTotal: 5 },
		},
		{ timestamp: 200, status: "failure", summary: "Install failed" },
	], 5, 7);

	expect(summary).toEqual({
		errorCount: 2,
		latestErrorTimestamp: 200,
		installedPlugins: 5,
		repositoryPlugins: 7,
		updatedPlugins: 2,
		updateTotal: 5,
	});
});

test("uses local 24-hour time and shows None when no error exists", () => {
	expect(formatLocalErrorTime(undefined)).toBe("None");
	expect(formatLocalErrorTime(new Date(2026, 9, 16, 7, 5).getTime())).toBe("07:05:00");
});

const baseState: ActivityConsoleState = {
	action: "fetch",
	phase: "running",
	current: 3,
	total: 7,
	errors: 0,
	installedCount: 7,
	repositoryCount: 8,
	updatedCount: 0,
	updatedTotal: 7,
	restartRequired: false,
};

test("formats progress and completion headers with restart advice", () => {
	expect(formatActivityConsoleHeader(baseState)).toBe("Fetching plugin list. 3 / 7");
	expect(formatActivityConsoleHeader({ ...baseState, action: "install" })).toBe("Installing all plugins. 3 / 7");
	expect(formatActivityConsoleHeader({ ...baseState, phase: "complete", restartRequired: true }))
		.toBe("Fetched plugin list. Restart required.");
	expect(formatActivityConsoleHeader({ ...baseState, phase: "failed", errors: 2 }))
		.toBe("Could not fetch plugin list. 2 errors.");
});

test("formats the latest error in local 24-hour time", () => {
	const formatted = formatLatestError(new Date(2026, 9, 16, 7, 5, 9).getTime());
	expect(formatted).toContain("07:05:09");
	expect(formatLatestError(undefined)).toBe("None");
});