export type RefetchLockState = {
	bulkActive: boolean;
	pluginKeys: Set<string>;
};

export function createRefetchLockState(): RefetchLockState {
	return { bulkActive: false, pluginKeys: new Set() };
}

export function acquireBulkRefetch(lock: RefetchLockState): (() => void) | undefined {
	if (lock.bulkActive || lock.pluginKeys.size > 0) return undefined;
	lock.bulkActive = true;
	let released = false;
	return () => {
		if (released) return;
		released = true;
		lock.bulkActive = false;
	};
}

export function acquirePluginRefetch(lock: RefetchLockState, pluginKey: string): (() => void) | undefined {
	if (lock.bulkActive || lock.pluginKeys.has(pluginKey)) return undefined;
	lock.pluginKeys.add(pluginKey);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		lock.pluginKeys.delete(pluginKey);
	};
}