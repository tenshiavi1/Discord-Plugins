import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";
import { createCategory, deleteCategory, getCategories, moveCategory } from "./data";

const { FormRow, FormSection } = Forms;

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
	const categories = getCategories();

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
					subLabel="Long-press a DM to pin it into a category."
					onPress={() => addCategory(categoryName, setCategoryName)}
				/>
			</FormSection>
			{categories.map((category, index) => (
				<FormSection key={category.id} title={category.name} titleStyleType="no_border">
					<FormRow
						label={`${category.channelIds.length} pinned ${category.channelIds.length === 1 ? "conversation" : "conversations"}`}
						subLabel="Pinned conversations follow your DM list's recent-activity order."
					/>
					<FormRow
						label="Move up"
						onPress={() => moveCategory(category.id, -1)}
						disabled={index === 0}
					/>
					<FormRow
						label="Move down"
						onPress={() => moveCategory(category.id, 1)}
						disabled={index === categories.length - 1}
					/>
					<FormRow
						label="Delete category"
						subLabel="Deleting a category also unpins its conversations."
						onPress={() => deleteCategory(category.id)}
					/>
				</FormSection>
			))}
		</RN.ScrollView>
	);
}
