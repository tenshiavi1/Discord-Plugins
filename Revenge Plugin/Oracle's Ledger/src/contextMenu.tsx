import { findByName, findByProps } from "@vendetta/metro";
import { React } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { Forms } from "@vendetta/ui/components";
import { findInReactTree } from "@vendetta/utils";
import { getCategories, getPinnedCategory, pinChannel, unpinChannel } from "./data";

const ActionSheetModule = findByProps("openLazy", "hideActionSheet");
const ActionSheetRows = findByProps("ActionSheetRow");
const ActionSheetRow = ActionSheetRows?.ActionSheetRow ?? Forms.FormRow;

function closeActionSheet(): void {
	ActionSheetModule?.hideActionSheet?.();
}

export function patchChannelActions(): () => void {
	const component = findByName("ChannelLongPressActionSheet", false);
	if (!component) {
		console.warn("[Oracle's Ledger] ChannelLongPressActionSheet was not found; use plugin settings to manage categories.");
		return () => undefined;
	}

	const pendingUnpatches: (() => void)[] = [];
	const unpatch = after("default", component, ([props], result) => {
		const channelId = props?.channelId ?? props?.channel?.id;
		if (typeof channelId !== "string" || !result?.type) return;

		pendingUnpatches.push(after("type", result, (_args, tree) => {
			const container = findInReactTree(tree, (node: any) => node?.key === "dm")?.props?.children;
			if (!Array.isArray(container)) {
				console.warn("[Oracle's Ledger] Could not locate DM actions in the long-press menu.");
				return;
			}

			const pinnedCategory = getPinnedCategory(channelId);
			if (pinnedCategory) {
				container.push(React.createElement(ActionSheetRow, {
					key: "oracles-ledger-unpin",
					label: "Remove from Oracle's Ledger",
					onPress: () => {
						closeActionSheet();
						unpinChannel(channelId);
					},
				}));
			}

			for (const category of getCategories()) {
				if (category.id === pinnedCategory?.id) continue;
				container.push(React.createElement(ActionSheetRow, {
					key: `oracles-ledger-${category.id}`,
					label: `${pinnedCategory ? "Move to" : "Pin to"} ${category.name}`,
					onPress: () => {
						closeActionSheet();
						pinChannel(channelId, category.id);
					},
				}));
			}
		}, true));
	});

	return () => {
		unpatch();
		for (const cleanup of pendingUnpatches.splice(0)) cleanup();
	};
}
