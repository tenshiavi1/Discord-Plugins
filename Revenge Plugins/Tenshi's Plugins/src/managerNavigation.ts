import { findByProps } from "../../compat";
import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

const RETURN_TO_MANAGER_KEY = "returnToManagerAfterReload";

function reloadWithRevengeNativeBridge() {
	const globalScope = globalThis as typeof globalThis & {
		__turboModuleProxy?: (name: string) => unknown;
		nativeModuleProxy?: Record<string, unknown>;
	};
	const bridge = ReactNative.NativeModules?.RNSVGRenderableModule
		?? globalScope.__turboModuleProxy?.("RNSVGRenderableModule")
		?? globalScope.nativeModuleProxy?.RNSVGRenderableModule;

	if (!bridge || typeof (bridge as { getBBox?: unknown }).getBBox !== "function") return false;

	const result: unknown = (bridge as {
		getBBox: (handle: number, payload: object) => unknown;
	}).getBBox(0, {
		revenge: {
			method: "revenge.app.reload",
			args: [],
		},
	});
	if (result && typeof result === "object" && "error" in result) {
		throw new Error(typeof result.error === "string" ? result.error : "Revenge's native reload bridge failed.");
	}
	if (!result || typeof result !== "object" || !("result" in result)) {
		throw new Error("Revenge's native reload bridge returned an invalid response.");
	}
	return true;
}

function findStackNavigation(navigation: any) {
	const visited = new Set<object>();
	let current = navigation;
	while (current && typeof current === "object" && !visited.has(current)) {
		visited.add(current);
		if (typeof current.push === "function") return current;
		current = current.getParent?.();
	}
	return undefined;
}

export function navigateToManager(Settings: React.ComponentType, currentNavigation?: any) {
	const rootNavigation = currentNavigation
		?? findByProps("getRootNavigationRef")?.getRootNavigationRef?.();
	if (!rootNavigation || rootNavigation.isReady?.() === false) return false;

	const page = {
		title: "Tenshi's Plugins",
		render: () => React.createElement(Settings),
	};
	const stackNavigation = findStackNavigation(rootNavigation);
	if (stackNavigation) {
		stackNavigation.push("VendettaCustomPage", page);
		return true;
	}
	if (typeof rootNavigation.navigate !== "function") return false;
	rootNavigation.navigate("VendettaCustomPage", page);
	return true;
}

export function reloadAndReturnToManager() {
	storage[RETURN_TO_MANAGER_KEY] = true;
	try {
		if (reloadWithRevengeNativeBridge()) return;
		if (typeof ReactNative.DevSettings?.reload === "function") {
			ReactNative.DevSettings.reload();
			return;
		}
		throw new Error("Revenge's native app reload function is unavailable.");
	} catch (error) {
		storage[RETURN_TO_MANAGER_KEY] = false;
		throw error;
	}
}

export function resumeManagerAfterReload(Settings: React.ComponentType) {
	if (!storage[RETURN_TO_MANAGER_KEY]) return;

	let attempts = 0;
	let lastError: unknown;
	const tryNavigate = () => {
		try {
			if (navigateToManager(Settings)) {
				storage[RETURN_TO_MANAGER_KEY] = false;
				return;
			}
		} catch (error) {
			lastError = error;
		}
		attempts++;
		if (attempts >= 240) {
			console.error("[Tenshi's Plugins] Could not reopen manager after app reload.", lastError);
			return;
		}
		setTimeout(tryNavigate, 250);
	};

	setTimeout(tryNavigate, 250);
}
