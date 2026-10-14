import { storage } from "@vendetta/plugin";
import { getCategories } from "./data";
import { patchChannelActions } from "./contextMenu";
import { patchPrivateChannels } from "./PrivateChannels";
import Settings from "./settings";

const unpatches: (() => void)[] = [];

export default {
	onLoad() {
		if (!Array.isArray(storage.categories)) storage.categories = [];
		if (getCategories().length === 0) {
			storage.categories = [{
				id: "oracle-default",
				name: "Pinned DMs",
				channelIds: [],
				collapsed: false,
			}];
		}

		unpatches.push(patchPrivateChannels());
		unpatches.push(patchChannelActions());
	},
	onUnload() {
		for (const unpatch of unpatches.splice(0)) unpatch();
	},
	settings: Settings,
};
