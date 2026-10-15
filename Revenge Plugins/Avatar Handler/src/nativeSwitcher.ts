import { after } from "@vendetta/patcher";
import { findByProps, findByStoreName } from "../../compat";

type MultiAccountStore = {
	canUseMultiAccountNotifications?: boolean;
};

let unpatchCapability: (() => void) | undefined;
let patchedMultiAccountStore: MultiAccountStore | undefined;
let originalNotificationDescriptor: PropertyDescriptor | undefined;
let patchedNotificationCapability = false;
let forcedNotificationGetter: (() => boolean) | undefined;

export function enableNativeSwitcher(): boolean {
	if (unpatchCapability && patchedNotificationCapability) return true;

	try {
		const accountCapabilities = findByProps("getCanUseMultiAccountMobile");
		const multiAccountStore: MultiAccountStore | undefined = findByStoreName("MultiAccountStore");
		if (typeof accountCapabilities?.getCanUseMultiAccountMobile !== "function") {
			console.warn("[Avatar Handler] Discord's mobile account-switcher capability was not found.");
			return false;
		}
		if (!multiAccountStore || (typeof multiAccountStore !== "object" && typeof multiAccountStore !== "function")) {
			console.warn("[Avatar Handler] Discord's multi-account store was not found.");
			return false;
		}

		const originalDescriptor = Object.getOwnPropertyDescriptor(multiAccountStore, "canUseMultiAccountNotifications");
		if (originalDescriptor && !originalDescriptor.configurable) {
			console.warn("[Avatar Handler] Discord's multi-account notification capability cannot be safely patched.");
			return false;
		}

		const unpatch = after(
			"getCanUseMultiAccountMobile",
			accountCapabilities,
			() => true,
		);
		const forceEnabled = () => true;
		try {
			Object.defineProperty(multiAccountStore, "canUseMultiAccountNotifications", {
				configurable: true,
				enumerable: originalDescriptor?.enumerable ?? true,
				get: forceEnabled,
			});
		} catch (error) {
			unpatch();
			console.error("[Avatar Handler] Could not enable Discord's multi-account notifications.", error);
			return false;
		}

		originalNotificationDescriptor = originalDescriptor;
		forcedNotificationGetter = forceEnabled;
		unpatchCapability = unpatch;
		patchedMultiAccountStore = multiAccountStore;
		patchedNotificationCapability = true;
		return true;
	} catch (error) {
		console.error("[Avatar Handler] Could not enable Discord's native account switcher.", error);
		return false;
	}
}

export function disableNativeSwitcher() {
	try {
		unpatchCapability?.();
	} catch (error) {
		console.error("[Avatar Handler] Could not remove Discord's account-switcher capability patch.", error);
	}
	unpatchCapability = undefined;

	if (patchedNotificationCapability && patchedMultiAccountStore) {
		try {
			const current = Object.getOwnPropertyDescriptor(patchedMultiAccountStore, "canUseMultiAccountNotifications");
			if (current?.get === forcedNotificationGetter) {
				if (originalNotificationDescriptor) {
					Object.defineProperty(patchedMultiAccountStore, "canUseMultiAccountNotifications", originalNotificationDescriptor);
				} else {
					delete patchedMultiAccountStore.canUseMultiAccountNotifications;
				}
			}
		} catch (error) {
			console.error("[Avatar Handler] Could not restore Discord's multi-account notification capability.", error);
		}
	}

	patchedMultiAccountStore = undefined;
	originalNotificationDescriptor = undefined;
	forcedNotificationGetter = undefined;
	patchedNotificationCapability = false;
}
