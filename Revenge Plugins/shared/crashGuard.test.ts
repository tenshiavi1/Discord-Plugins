import { afterEach, expect, test } from "bun:test";
import { installPluginCrashGuard } from "./crashGuard";

const global = globalThis as typeof globalThis & { ErrorUtils?: unknown };
const originalErrorUtils = global.ErrorUtils;

afterEach(() => {
	global.ErrorUtils = originalErrorUtils;
});

test("shares one global wrapper and preserves the previous handler", () => {
	let previousCalls = 0;
	let currentHandler = () => {};
	const previousHandler = () => previousCalls++;
	const errorUtils = {
		getGlobalHandler: () => currentHandler,
		setGlobalHandler: (handler: () => void) => {
			currentHandler = handler;
		},
	};
	currentHandler = previousHandler;
	global.ErrorUtils = errorUtils;

	const pluginStorage: Record<string, unknown> = {};
	const managerStorage: Record<string, unknown> = {};
	const removeManager = installPluginCrashGuard("Tenshi's Plugins", managerStorage);
	const wrapper = currentHandler;
	const removePlugin = installPluginCrashGuard("God Console", pluginStorage, {
		features: [{ storageKey: "validUserEnabled", patterns: [/validUser/i] }],
	});

	expect(currentHandler).toBe(wrapper);
	currentHandler(new Error("God Console validUser failed"), true);
	expect(previousCalls).toBe(1);
	expect((pluginStorage.lastCrash as { pluginName: string }).pluginName).toBe("God Console");
	expect((managerStorage.lastCrash as { pluginName: string }).pluginName).toBe("God Console");
	expect((pluginStorage.pendingCrashDisable as { storageKey: string }[])[0].storageKey).toBe("validUserEnabled");

	removeManager();
	removePlugin();
	expect(currentHandler).toBe(previousHandler);
});

test("keeps fatal diagnostics when a non-fatal error follows and recovers on load", () => {
	let currentHandler = () => {};
	const previousHandler = () => {};
	const errorUtils = {
		getGlobalHandler: () => currentHandler,
		setGlobalHandler: (handler: () => void) => {
			currentHandler = handler;
		},
	};
	currentHandler = previousHandler;
	global.ErrorUtils = errorUtils;

	const pluginStorage: Record<string, unknown> = {};
	const options = {
		features: [{ storageKey: "enabled", patterns: [/criticalFeature/i] }],
		fallbackKeys: ["enabled"],
	};
	const remove = installPluginCrashGuard("Aura Control", pluginStorage, options);
	currentHandler(new Error("Aura Control criticalFeature failed"), true);
	const fatalLog = pluginStorage.lastCrash;
	currentHandler(new Error("Aura Control transient warning"), false);
	expect(pluginStorage.lastCrash).toBe(fatalLog);
	expect(pluginStorage.lastError).toBeDefined();
	remove();

	pluginStorage.enabled = true;
	const removeAfterReload = installPluginCrashGuard("Aura Control", pluginStorage, options);
	expect(pluginStorage.enabled).toBe(false);
	expect(pluginStorage.pendingCrashDisable).toEqual([]);
	removeAfterReload();
});

test("retains unattributed fatal errors without disabling a plugin", () => {
	let currentHandler = () => {};
	const previousHandler = () => {};
	const errorUtils = {
		getGlobalHandler: () => currentHandler,
		setGlobalHandler: (handler: () => void) => {
			currentHandler = handler;
		},
	};
	currentHandler = previousHandler;
	global.ErrorUtils = errorUtils;

	const pluginStorage: Record<string, unknown> = {};
	const remove = installPluginCrashGuard("God Console", pluginStorage, {
		features: [{ storageKey: "validUserEnabled" }],
		fallbackKeys: ["validUserEnabled"],
	});
	currentHandler(new Error("Unattributed runtime error"), true);

	expect((pluginStorage.lastCrash as { pluginName: string }).pluginName).toBe("Unknown plugin");
	expect(pluginStorage.pendingCrashDisable).toBeUndefined();
	remove();
});

test("deduplicates identical diagnostics but forwards every error", () => {
	let previousCalls = 0;
	let currentHandler = () => {};
	const previousHandler = () => previousCalls++;
	const errorUtils = {
		getGlobalHandler: () => currentHandler,
		setGlobalHandler: (handler: () => void) => {
			currentHandler = handler;
		},
	};
	currentHandler = previousHandler;
	global.ErrorUtils = errorUtils;

	const pluginStorage: Record<string, unknown> = {};
	const remove = installPluginCrashGuard("God Console", pluginStorage);
	currentHandler(new Error("God Console repeated error"), false);
	const firstRecord = pluginStorage.lastError;
	currentHandler(new Error("God Console repeated error"), false);

	expect(previousCalls).toBe(2);
	expect(pluginStorage.lastError).toBe(firstRecord);
	remove();
});

test("reattaches after another handler replaces ErrorUtils without double recording", () => {
	type TestHandler = (error?: unknown, isFatal?: boolean) => void;
	let previousCalls = 0;
	let externalCalls = 0;
	let currentHandler: TestHandler = () => {};
	const previousHandler: TestHandler = () => previousCalls++;
	const errorUtils = {
		getGlobalHandler: () => currentHandler,
		setGlobalHandler: (handler: TestHandler) => {
			currentHandler = handler;
		},
	};
	currentHandler = previousHandler;
	global.ErrorUtils = errorUtils;

	const pluginStorage: Record<string, unknown> = {};
	const removePlugin = installPluginCrashGuard("God Console", pluginStorage);
	const firstWrapper = currentHandler;
	const externalHandler: TestHandler = (error, isFatal) => {
		externalCalls++;
		firstWrapper(error, isFatal);
	};
	currentHandler = externalHandler;
	const removeSecondPlugin = installPluginCrashGuard("Avatar Handler", {});

	currentHandler(new Error("God Console crash"), true);
	expect(externalCalls).toBe(1);
	expect(previousCalls).toBe(1);
	expect((pluginStorage.lastCrash as { pluginName: string }).pluginName).toBe("God Console");

	removeSecondPlugin();
	removePlugin();
	expect(currentHandler).toBe(externalHandler);
});