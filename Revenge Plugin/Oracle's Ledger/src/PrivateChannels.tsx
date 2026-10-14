import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { getCategories, setCategoryCollapsed } from "./data";

const PrivateChannelSortStore = findByProps("getPrivateChannelIds");
const MessageRequestStore = findByProps("shouldShowMessageRequests");
const ReadStateStore = findByStoreName("ReadStateStore");
const SelectedChannelStore = findByStoreName("SelectedChannelStore");
const RowHeightModule = findByProps("getPrivateChannelRowHeightWithoutPadding");
const ConnectedPrivateChannels = findByName("ConnectedPrivateChannels", false);
const CategoryChannel = findByName("CategoryChannel", false);
const unpatches: (() => void)[] = [];
let patchedPrototypes = new WeakSet<object>();
const { View, Text, Pressable } = RN;

function useStore(store: any): void {
	const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
	React.useEffect(() => {
		if (typeof store?.addChangeListener !== "function" || typeof store?.removeChangeListener !== "function") return;
		const listener = () => forceUpdate();
		store.addChangeListener(listener);
		return () => store.removeChangeListener(listener);
	}, [store]);
}

function PinnedPrivateChannelList({ list }: { list: any }) {
	useProxy(storage);
	useStore(PrivateChannelSortStore);
	useStore(ReadStateStore);
	useStore(SelectedChannelStore);

	const props = list?.props;
	if (!props || typeof props.renderItem !== "function" || typeof props.itemSize !== "function") return list;
	if (typeof PrivateChannelSortStore?.getPrivateChannelIds !== "function") {
		console.warn("[Oracle's Ledger] The private-channel sort store is unavailable; pinned DMs cannot be rendered.");
		return list;
	}

	const categories = getCategories();
	const privateChannelIds = PrivateChannelSortStore.getPrivateChannelIds();
	const hasMessageRequests = Boolean(MessageRequestStore?.shouldShowMessageRequests?.());
	const messageRequestOffset = hasMessageRequests ? 1 : 0;
	const pinnedIndices = new Set<number>();
	const selectedChannelId = SelectedChannelStore?.getChannelId?.();
	let visiblePinnedCount = 0;

	const categoryContents = categories.map((category) => {
		const channelRows = privateChannelIds.flatMap((id: string, index: number) =>
			category.channelIds.includes(id) ? [{ id, index: index + messageRequestOffset }] : [],
		);

		const rows = channelRows.map((channel) => {
			pinnedIndices.add(channel.index);
			const selected = channel.id === selectedChannelId;
			const unread = Boolean(ReadStateStore?.hasUnread?.(channel.id));
			const hidden = category.collapsed && !selected && !unread;
			if (!hidden) visiblePinnedCount++;
			return {
				...channel,
				hidden,
				element: props.renderItem(0, channel.index),
			};
		});
		return { category, rows };
	});

	const renderHeader = () => (
		<>
			{hasMessageRequests ? props.renderItem(0, 0) : null}
			{categoryContents.map(({ category, rows }) => (
				<React.Fragment key={category.id}>
					<Pressable
						onPress={() => setCategoryCollapsed(category.id, !category.collapsed)}
						accessibilityRole="button"
						accessibilityLabel={`${category.collapsed ? "Expand" : "Collapse"} ${category.name}`}
					>
						{renderCategoryHeading(category.name, category.collapsed)}
					</Pressable>
					{rows.filter((row) => !row.hidden).map((row) => (
						<React.Fragment key={row.id}>{row.element}</React.Fragment>
					))}
				</React.Fragment>
			))}
			{renderCategoryHeading("Direct Messages", false, false)}
		</>
	);

	const headerHeight = 32 * (categories.length + 1 + messageRequestOffset);
	const rowHeight = RowHeightModule?.getPrivateChannelRowHeight?.(1);
	const resolvedRowHeight = typeof rowHeight === "number" && rowHeight > 0 ? rowHeight : 72;
	const pinnedHeaderHeight = headerHeight + visiblePinnedCount * resolvedRowHeight;
	const renderCategoryHeading = (name: string, collapsed = false, renderChevron = true) => CategoryChannel
		? React.createElement(CategoryChannel, { name, collapsed, renderChevron })
		: React.createElement(View, { style: { minHeight: 32, justifyContent: "center", paddingHorizontal: 16 } },
			React.createElement(Text, { style: { fontWeight: "600" } }, name));

	return React.createElement(list.type, {
		...props,
		sections: [1, props.sections?.[0] ?? 0],
		renderItem: (sectionIndex: number, itemIndex: number) => {
			if (sectionIndex === 0) return renderHeader();
			if ((hasMessageRequests && itemIndex === 0) || pinnedIndices.has(itemIndex)) return null;
			return props.renderItem(sectionIndex, itemIndex);
		},
		itemSize: (sectionIndex: number, itemIndex: number) => {
			if (sectionIndex === 0) return pinnedHeaderHeight;
			if ((hasMessageRequests && itemIndex === 0) || pinnedIndices.has(itemIndex)) return 0;
			return props.itemSize(sectionIndex, itemIndex);
		},
	});
}

export function patchPrivateChannels(): () => void {
	if (!ConnectedPrivateChannels) {
		console.warn("[Oracle's Ledger] ConnectedPrivateChannels was not found; pinned categories cannot be shown.");
		return () => undefined;
	}

	const unpatch = after("default", ConnectedPrivateChannels, (_args, component) => {
		const prototype = component?.type?.prototype;
		if (!prototype || patchedPrototypes.has(prototype)) return;
		patchedPrototypes.add(prototype);

		unpatches.push(after("render", prototype, (_renderArgs, result) => {
			const rows = result?.props?.children?.props?.children;
			if (!Array.isArray(rows)) {
				console.warn("[Oracle's Ledger] The private-channel list layout changed; pinned categories could not be attached.");
				return;
			}

			const listIndex = rows.findIndex((row: any) =>
				row?.props?.renderItem && row?.props?.itemSize && Array.isArray(row?.props?.sections),
			);
			if (listIndex < 0) {
				console.warn("[Oracle's Ledger] The private-channel list was not found in the connected channel view.");
				return;
			}

			if (rows[listIndex]?.type !== PinnedPrivateChannelList) {
				rows[listIndex] = React.createElement(PinnedPrivateChannelList, { list: rows[listIndex] });
			}
		}));
	});

	return () => {
		unpatch();
		for (const cleanup of unpatches.splice(0)) cleanup();
		patchedPrototypes = new WeakSet<object>();
	};
}
