import { expect, test } from "bun:test";
import { addPendingRestart, isPendingRestartFromPreviousSession, needsManagerRestart } from "./restartStateCore";

test("deduplicates manager restart advice for updated plugins", () => {
	const first = addPendingRestart(undefined, "Tenshi's Plugins", "session-1", 100);
	const second = addPendingRestart(first, "Tenshi's Plugins", "session-1", 200);
	const third = addPendingRestart(second, "Aura Control", "session-1", 300);
	expect(third.pluginNames).toEqual(["Tenshi's Plugins", "Aura Control"]);
	expect(third.updatedAt).toBe(300);
	expect(isPendingRestartFromPreviousSession(third, "session-1")).toBe(false);
	expect(isPendingRestartFromPreviousSession(third, "session-2")).toBe(true);
});

test("requires restart only for changed manager code that was already running", () => {
	expect(needsManagerRestart("Tenshi's Plugins", true, true)).toBe(true);
	expect(needsManagerRestart("Tenshi's Plugins", false, true)).toBe(false);
	expect(needsManagerRestart("Tenshi's Plugins", true, false)).toBe(false);
	expect(needsManagerRestart("Aura Control", true, true)).toBe(false);
});