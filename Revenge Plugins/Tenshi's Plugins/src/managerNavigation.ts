import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

const tabsNavigationRef = findByProps("getRootNavigationRef");
const RETURN_TO_MANAGER_KEY = "returnToManagerAfterReload";

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
	if (!ReactNative.DevSettings?.reload) {
		throw new Error("Revenge's app reload function is unavailable.");
	}

	storage[RETURN_TO_MANAGER_KEY] = true;
	try {
		ReactNative.DevSettings.reload();
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
