import { storage } from "@vendetta/plugin";
import { clearActivity, publishActivity, resetPluginStartTime } from "./activity";
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

export default {
	onLoad() {
		for (const [key, value] of Object.entries(defaults)) {
			if (storage[key] === undefined) storage[key] = value;
		}
		resetPluginStartTime();
		if (storage.enabled) {
			void publishActivity().catch((error) => {
				console.error("[Aura Control] Could not publish saved activity.", error);
				storage.enabled = false;
				try {
					clearActivity();
				} catch (clearError) {
					console.error("[Aura Control] Could not clear activity after startup failed.", clearError);
				}
			});
		}
	},
	settings: Settings,
};
