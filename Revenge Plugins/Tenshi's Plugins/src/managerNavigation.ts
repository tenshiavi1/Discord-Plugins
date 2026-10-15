import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

const tabsNavigationRef = findByProps("getRootNavigationRef");
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

export function navigateToManager(Settings: React.ComponentType) {
	const navigation = tabsNavigationRef?.getRootNavigationRef?.();
	if (!navigation) return false;

	navigation.navigate("VendettaCustomPage", {
		title: "Tenshi's Plugins",
		render: () => React.createElement(Settings),
	});
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
	storage[RETURN_TO_MANAGER_KEY] = false;

	let attempts = 0;
	let lastError: unknown;
	const tryNavigate = () => {
		try {
			if (navigateToManager(Settings)) return;
		} catch (error) {
			lastError = error;
		}
		attempts++;
		if (attempts >= 50) {
			console.error("[Tenshi's Plugins] Could not reopen manager after app reload.", lastError);
			return;
		}
		setTimeout(tryNavigate, 100);
	};

	setTimeout(tryNavigate, 100);
}
