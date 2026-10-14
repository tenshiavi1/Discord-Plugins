import { storage } from "@vendetta/plugin";

export type Category = {
	id: string;
	name: string;
	channelIds: string[];
	collapsed: boolean;
};

export function getCategories(): Category[] {
	if (!Array.isArray(storage.categories)) storage.categories = [];
	return storage.categories;
}

export function isPinned(channelId: string): boolean {
	return getCategories().some((category) => category.channelIds.includes(channelId));
}

export function getPinnedCategory(channelId: string): Category | undefined {
	return getCategories().find((category) => category.channelIds.includes(channelId));
}

export function createCategory(name: string): boolean {
	const normalizedName = name.trim();
	if (!normalizedName || getCategories().some((category) => category.name.toLowerCase() === normalizedName.toLowerCase())) {
		return false;
	}

	storage.categories = [
		...getCategories(),
		{
			id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
			name: normalizedName,
			channelIds: [],
			collapsed: false,
		},
	];
	return true;
}

export function pinChannel(channelId: string, categoryId: string): void {
	const categories = getCategories().map((category) => ({
		...category,
		channelIds: category.channelIds.filter((id) => id !== channelId),
	}));
	const category = categories.find((entry) => entry.id === categoryId);
	if (!category) {
		console.warn(`[Oracle's Ledger] Cannot pin channel: category ${categoryId} was not found.`);
		return;
	}

	category.channelIds = [...category.channelIds, channelId];
	storage.categories = categories;
}

export function unpinChannel(channelId: string): void {
	storage.categories = getCategories().map((category) => ({
		...category,
		channelIds: category.channelIds.filter((id) => id !== channelId),
	}));
}

export function setCategoryCollapsed(categoryId: string, collapsed: boolean): void {
	storage.categories = getCategories().map((category) =>
		category.id === categoryId ? { ...category, collapsed } : category,
	);
}

export function deleteCategory(categoryId: string): void {
	storage.categories = getCategories().filter((category) => category.id !== categoryId);
}

export function moveCategory(categoryId: string, direction: -1 | 1): void {
	const categories = [...getCategories()];
	const index = categories.findIndex((category) => category.id === categoryId);
	const nextIndex = index + direction;
	if (index < 0 || nextIndex < 0 || nextIndex >= categories.length) return;
	[categories[index], categories[nextIndex]] = [categories[nextIndex], categories[index]];
	storage.categories = categories;
}
