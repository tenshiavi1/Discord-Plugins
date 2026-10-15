import { storage } from "@vendetta/plugin";
import { installPluginCrashGuard } from "../../shared/crashGuard";
import { installActivitySessionRestore, restoreActivitySession } from "./activity";
import Settings from "./settings";

const registerCrashGuard = () => installPluginCrashGuard("Aura Control", storage, {
	features: [{ storageKey: "enabled" }],
	fallbackKeys: ["enabled"],
});
let removeCrashGuard: (() => void) | undefined = registerCrashGuard();

const defaults = {
	enabled: false,
	applicationId: "",
	applicationName: "My Activity",
	activityType: 0,
	displayType: 0,
	details: "",
	detailsUrl: "",
	state: "",
	stateUrl: "",
	streamUrl: "",
	timestampMode: "connection",
	timestampConnection: 0,
	timestampStartup: 0,
	timestampLastUpdate: 0,
	timestampCustomStart: "",
	timestampCustomEnd: "",
	timestampEndEnabled: false,
	largeImageKey: "",
	largeImageText: "",
	largeImageUrl: "",
	smallImageKey: "",
	smallImageText: "",
	smallImageUrl: "",
	buttonOneLabel: "",
	buttonOneUrl: "",
	buttonTwoLabel: "",
	buttonTwoUrl: "",
	partySize: "",
	partyMaxSize: "",
};

let removeSessionRestore: (() => void) | undefined;

export default {
	onLoad() {
		removeCrashGuard ??= registerCrashGuard();
		for (const [key, value] of Object.entries(defaults)) {
			if (storage[key] === undefined) storage[key] = value;
		}
		restoreActivitySession();
		removeSessionRestore = installActivitySessionRestore();
	},
	onUnload() {
		removeCrashGuard?.();
		removeCrashGuard = undefined;
		removeSessionRestore?.();
		removeSessionRestore = undefined;
	},
	settings: Settings,
};
