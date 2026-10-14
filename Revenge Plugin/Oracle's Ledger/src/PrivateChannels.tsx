import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { ErrorBoundary, General } from "@vendetta/ui/components";
import { getCategories, setCategoryCollapsed } from "./data";

const getPrivateChannelRowHeight = findByProps("getPrivateChannelRowHeightWithoutPadding")?.getPrivateChannelRowHeight;
const PrivateChannelSortStore = findByProps("getPrivateChannelIds");
const MessageRequestStore = findByProps("shouldShowMessageRequests");
const ReadStateStore = findByStoreName("ReadStateStore");
const UserGuildSettingsStore = findByStoreName("UserGuildSettingsStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");
const ConnectedPrivateChannels = findByName("ConnectedPrivateChannels", false);
const CategoryChannel = findByName("CategoryChannel");
const FastList = findByName("FastList");
const { Pressable } = General;
const unpatches: (() => void)[] = [];
let nestedPatchInstalled = false;

function useStore(store: any): void {
	const [, forceUpdate] = React.useReducer((value: number) => ~value, 0);
	React.useEffect(() => {
		if (typeof store?.addChangeListener !== "function" || typeof store?.removeChangeListener !== "function") return;
		const listener = () => forceUpdate();
		store.addChangeListener(listener);
		return () => store.removeChangeListener(listener);
	}, [store]);
}

function PinnedPrivateChannelList({ comp }: { comp: any }) {
	useProxy(storage);
	useStore(ReadStateStore);
	useStore(UserGuildSettingsStore);

	if (!comp?.props || typeof comp.props.renderItem !== "function" || typeof comp.props.itemSize !== "function") {
		console.warn("[Oracle's Ledger] The private-channel list has an unexpected shape.");
		return comp ?? null;
	}
	if (!FastList || typeof PrivateChannelSortStore?.getPrivateChannelIds !== "function") {
		console.warn("[Oracle's Ledger] Revenge's private-channel list modules were not found.");
		return comp;
	}

	const categories = getCategories();
	const privateChannelIds: string[] = PrivateChannelSortStore.getPrivateChannelIds();
	const showMessageRequests = Boolean(MessageRequestStore?.shouldShowMessageRequests?.());
	const messageRequestOffset = Number(showMessageRequests);
	const selectedChannelId = SelectedChannelStore?.getChannelId?.();
	const categorizedIndices = new Set<number>();
	let visiblePinnedChannels = 0;

	const categoryRows = categories.map((category) => {
		const rows = privateChannelIds.flatMap((id, index) =>
			category.channelIds.includes(id)
				? [{
					id,
					index: index + messageRequestOffset,
					selected: selectedChannelId === id,
					unread: Boolean(ReadStateStore?.hasUnread?.(id))
						&& !Boolean(UserGuildSettingsStore?.isChannelMuted?.(null, id)),
				}]
				: [],
		);

		for (const row of rows) categorizedIndices.add(row.index);
		return { category, rows };
	});

	function hideCollapsedRow(category: (typeof categories)[number], row: (typeof categoryRows)[number]["rows"][number]) {
		return category.collapsed && !row.selected && !row.unread;
	}

	for (const { category, rows } of categoryRows) {
		visiblePinnedChannels += rows.filter((row) => !hideCollapsedRow(category, row)).length;
	}

	const getCategoryHeader = (name: string, collapsed = false, renderChevron = true) => CategoryChannel
		? React.createElement(CategoryChannel, { name, collapsed, renderChevron })
		: React.createElement(
			RN.Text,
			{ style: { color: "#b5bac1", fontSize: 12, fontWeight: "600", paddingVertical: 8, paddingHorizontal: 16 } },
			`${renderChevron ? (collapsed ? "›" : "⌄") + " " : ""}${name}`,
		);

	function renderSectionHeader() {
		return React.createElement(ErrorBoundary, null, React.createElement(React.Fragment, null,
			showMessageRequests ? comp.props.renderItem(0, 0) : null,
			...categoryRows.flatMap(({ category, rows }) => [
				React.createElement(
					Pressable,
					{
						key: `oracle-category-header-${category.id}`,
						onPress: () => setCategoryCollapsed(category.id, !category.collapsed),
						accessibilityRole: "button",
						accessibilityLabel: `${category.collapsed ? "Expand" : "Collapse"} ${category.name}`,
					},
					getCategoryHeader(category.name, category.collapsed),
				),
				...rows
					.filter((row) => !hideCollapsedRow(category, row))
					.map((row) => React.createElement(React.Fragment, { key: `oracle-channel-${row.id}` }, comp.props.renderItem(0, row.index))),
			]),
			getCategoryHeader("Direct Messages", false, false),
		));
	}

	const sectionHeaderHeight = 32 * (1 + categories.length);
	const channelRowHeight = typeof getPrivateChannelRowHeight === "function"
		? getPrivateChannelRowHeight(1)
		: undefined;
	const rowHeight = typeof channelRowHeight === "number" && channelRowHeight > 0 ? channelRowHeight : 72;

	return React.createElement(FastList, {
		...comp.props,
		sections: [1, comp.props.sections?.[0] ?? 0],
		onScroll: () => undefined,
		renderItem: (sectionIndex: number, itemIndex: number) => {
			if (sectionIndex === 0) return renderSectionHeader();
			if ((showMessageRequests && itemIndex === 0) || categorizedIndices.has(itemIndex)) return null;
			return comp.props.renderItem(sectionIndex, itemIndex);
		},
		itemSize: (sectionIndex: number, itemIndex: number) => {
			if (sectionIndex === 0) {
				return sectionHeaderHeight + rowHeight * (visiblePinnedChannels + messageRequestOffset);
			}
			if ((showMessageRequests && itemIndex === 0) || categorizedIndices.has(itemIndex)) return 0;
			return comp.props.itemSize(sectionIndex, itemIndex);
		},
	});
}

export function patchPrivateChannels(): () => void {
	if (!ConnectedPrivateChannels) {
		console.warn("[Oracle's Ledger] ConnectedPrivateChannels was not found; pinned categories cannot be shown.");
		return () => undefined;
	}

	const unpatch = after("default", ConnectedPrivateChannels, (_args, connectedChannels) => {
		if (nestedPatchInstalled) return;
		const prototype = connectedChannels?.type?.prototype;
		if (!prototype) {
			console.warn("[Oracle's Ledger] ConnectedPrivateChannels did not expose a renderable component.");
			return;
		}
		nestedPatchInstalled = true;

		unpatches.push(after("render", prototype, (_renderArgs, result) => {
			const children = result?.props?.children?.props?.children;
			if (!Array.isArray(children)) {
				console.warn("[Oracle's Ledger] ConnectedPrivateChannels' list children changed; pinned categories were not attached.");
				return;
			}
			if (children.some((child) => child?.type === PinnedPrivateChannelList)) return;

			const isPrivateChannelList = (child: any) =>
				child?.props
				&& typeof child.props.renderItem === "function"
				&& typeof child.props.itemSize === "function"
				&& Array.isArray(child.props.sections);
			const listIndex = isPrivateChannelList(children[2])
				? 2
				: children.findIndex(isPrivateChannelList);

			if (listIndex < 0) {
				console.warn("[Oracle's Ledger] Could not locate the private-channel FastList; pinned categories were not attached.");
				return;
			}
			if (children[listIndex].type === PinnedPrivateChannelList) return;
			children[listIndex] = React.createElement(PinnedPrivateChannelList, { comp: children[listIndex] });
		}));
	});

	return () => {
		unpatch();
		for (const cleanup of unpatches.splice(0)) cleanup();
		nestedPatchInstalled = false;
	};
}
