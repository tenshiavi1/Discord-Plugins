import { expect, test } from "bun:test";
import { claimAutoFetchStartup, formatAutoFetchProgress } from "./autoFetchGate";

test("claims auto-fetch only once per client runtime", () => {
	const state = { startupHandled: false };
	expect(claimAutoFetchStartup(state, true)).toBe(true);
	expect(claimAutoFetchStartup(state, true)).toBe(false);
	expect(state.startupHandled).toBe(true);
});

test("does not start auto-fetch when enabled after the client has started", () => {
	const state = { startupHandled: false };
	expect(claimAutoFetchStartup(state, false)).toBe(false);
	expect(claimAutoFetchStartup(state, true)).toBe(false);
});

test("formats automatic update progress for each loading phase", () => {
	expect(formatAutoFetchProgress(undefined)).toBe("Updating plugins…");
	expect(formatAutoFetchProgress({ phase: "scheduled", completed: 0, total: 0, pluginName: "" }))
		.toBe("Starting automatic updates…");
	expect(formatAutoFetchProgress({ phase: "loading", completed: 0, total: 0, pluginName: "" }))
		.toBe("Loading plugin list…");
	expect(formatAutoFetchProgress({ phase: "updating", completed: 3, total: 7, pluginName: "Aura Control" }))
		.toBe("Updating Aura Control (3/7)…");
});