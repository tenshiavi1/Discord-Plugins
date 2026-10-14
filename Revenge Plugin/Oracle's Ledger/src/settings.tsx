import { findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import {
	createCategory,
	deleteCategory,
	getCategories,
	getPinnedCategory,
	moveCategory,
	pinChannel,
	setCategoryCollapsed,
	unpinChannel,
} from "./data";

const { FormRow, FormSection } = Forms;
const PrivateChannelSortStore = findByProps("getPrivateChannelIds");
const ChannelStore = findByStoreName("ChannelStore") ?? findByProps("getChannel");
const UserStore = findByProps("getUser", "getCurrentUser");
const ChannelTransitions = findByProps("transitionToChannel");

function getChannelName(channelId: string): string {
	const channel = ChannelStore?.getChannel?.(channelId);
	if (typeof channel?.name === "string" && channel.name.length > 0) return channel.name;

	const recipientNames = (channel?.recipientIds ?? [])
		.map((userId: string) => UserStore?.getUser?.(userId))
		.filter(Boolean)
		.map((user: any) => user.globalName ?? user.username ?? user.displayName)
		.filter((name: unknown): name is string => typeof name === "string" && name.length > 0);

	if (recipientNames.length > 0) return recipientNames.join(", ");
	return `Direct Message ${channelId.slice(-4)}`;
}

function openConversation(channelId: string): void {
	if (typeof ChannelTransitions?.transitionToChannel !== "function") {
		showToast("Discord's channel navigation is unavailable.");
		console.warn("[Oracle's Ledger] transitionToChannel was not found; cannot open a conversation.");
		return;
	}

	try {
		ChannelTransitions.transitionToChannel(channelId);
	} catch (error) {
		console.error("[Oracle's Ledger] Failed to open conversation.", error);
		showToast("Could not open this conversation.");
	}
}

function addCategory(name: string, clear: (value: string) => void): void {
	if (createCategory(name)) {
		clear("");
		return;
	}
	showToast("Enter a unique category name.");
}

export default function Settings() {
	useProxy(storage);
	const [categoryName, setCategoryName] = React.useState("");
	const [, forceUpdate] = React.useReducer((value: number) => ~value, 0);
	const categories = getCategories();
	const channelIds: string[] = typeof PrivateChannelSortStore?.getPrivateChannelIds === "function"
		? PrivateChannelSortStore.getPrivateChannelIds()
		: [];
	const categoryRows = categories.map((category) => ({
		category,
		channelIds: channelIds.filter((channelId) => category.channelIds.includes(channelId)),
	}));
	const unassignedIds = channelIds.filter((channelId) => !getPinnedCategory(channelId));

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
			<FormSection title="Create a category" titleStyleType="no_border">
				<RN.TextInput
					placeholder="Category name"
					value={categoryName}
					onChangeText={setCategoryName}
					returnKeyType="done"
					onSubmitEditing={() => addCategory(categoryName, setCategoryName)}
					style={{ paddingHorizontal: 16, paddingVertical: 12, color: "#f2f3f5" }}
				/>
				<FormRow
					label="Add category"
					subLabel="Organize conversations below. Tap a conversation to open it."
					onPress={() => addCategory(categoryName, setCategoryName)}
				/>
			</FormSection>
			{typeof PrivateChannelSortStore?.getPrivateChannelIds !== "function" && (
				<FormSection title="Conversations unavailable" titleStyleType="no_border">
					<FormRow label="Discord's direct-message list could not be loaded." />
				</FormSection>
			)}
			{categoryRows.map(({ category, channelIds: pinnedIds }, index) => (
				<FormSection key={category.id} title={`${category.name} (${pinnedIds.length})`} titleStyleType="no_border">
					<FormRow
						label={category.collapsed ? "Show conversations" : "Hide conversations"}
						onPress={() => setCategoryCollapsed(category.id, !category.collapsed)}
					/>
					{!category.collapsed && pinnedIds.map((channelId) => (
						<React.Fragment key={channelId}>
							<FormRow
								label={getChannelName(channelId)}
								subLabel="Tap to open this conversation."
								onPress={() => openConversation(channelId)}
							/>
							{categories.filter((other) => other.id !== category.id).map((other) => (
								<FormRow
									key={`${channelId}-${other.id}`}
									label={`Move to ${other.name}`}
									onPress={() => {
										pinChannel(channelId, other.id);
										forceUpdate();
									}}
								/>
							))}
							<FormRow
								label="Remove from category"
								onPress={() => {
									unpinChannel(channelId);
									forceUpdate();
								}}
							/>
						</React.Fragment>
					))}
					<FormRow
						label="Move category up"
						onPress={() => moveCategory(category.id, -1)}
						disabled={index === 0}
					/>
					<FormRow
						label="Move category down"
						onPress={() => moveCategory(category.id, 1)}
						disabled={index === categories.length - 1}
					/>
					<FormRow
						label="Delete category"
						subLabel="Deleting a category also unassigns its conversations."
						onPress={() => deleteCategory(category.id)}
					/>
				</FormSection>
			))}
			<FormSection title={`Unassigned DMs (${unassignedIds.length})`} titleStyleType="no_border">
				{unassignedIds.length === 0 && <FormRow label="All available DMs are organized." />}
				{unassignedIds.map((channelId) => (
					<React.Fragment key={channelId}>
						<FormRow
							label={getChannelName(channelId)}
							subLabel="Tap to open this conversation."
							onPress={() => openConversation(channelId)}
						/>
						{categories.map((category) => (
							<FormRow
								key={`${channelId}-${category.id}`}
								label={`Add to ${category.name}`}
								onPress={() => {
									pinChannel(channelId, category.id);
									forceUpdate();
								}}
							/>
						))}
					</React.Fragment>
				))}
			</FormSection>
		</RN.ScrollView>
	);
}
