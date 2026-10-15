import { storage } from "@vendetta/plugin";
import { installActivitySessionRestore, restoreActivitySession } from "./activity";
import Settings from "./settings";

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
		for (const [key, value] of Object.entries(defaults)) {
			if (storage[key] === undefined) storage[key] = value;
		}
		restoreActivitySession();
		removeSessionRestore = installActivitySessionRestore();
	},
	onUnload() {
		removeSessionRestore?.();
		removeSessionRestore = undefined;
	},
	settings: Settings,
};
