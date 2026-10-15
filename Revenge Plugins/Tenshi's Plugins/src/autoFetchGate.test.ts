import { expect, test } from "bun:test";
import { claimAutoFetchStartup } from "./autoFetchGate";

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