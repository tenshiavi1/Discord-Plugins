import { expect, test } from "bun:test";
import { addPendingRestart, isPendingRestartFromPreviousSession } from "./restartStateCore";

test("deduplicates manager restart advice for updated plugins", () => {
	const first = addPendingRestart(undefined, "Tenshi's Plugins", "session-1", 100);
	const second = addPendingRestart(first, "Tenshi's Plugins", "session-1", 200);
	const third = addPendingRestart(second, "Aura Control", "session-1", 300);
	expect(third.pluginNames).toEqual(["Tenshi's Plugins", "Aura Control"]);
	expect(third.updatedAt).toBe(300);
	expect(isPendingRestartFromPreviousSession(third, "session-1")).toBe(false);
	expect(isPendingRestartFromPreviousSession(third, "session-2")).toBe(true);
});