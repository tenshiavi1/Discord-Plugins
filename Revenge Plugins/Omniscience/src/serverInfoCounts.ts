export function countGroupedChannels(groups: unknown): number | undefined {
	if (!groups || typeof groups !== "object") return undefined;
	return Object.values(groups).reduce(
		(total, group) => total + (Array.isArray(group) ? group.length : 0),
		0,
	);
}
