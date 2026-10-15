import { expect, test } from "bun:test";
import { acquireBulkRefetch, acquirePluginRefetch, createRefetchLockState } from "./refetchLock";

test("prevents single and bulk refetches from overlapping", () => {
	const lock = createRefetchLockState();
	const releaseBulk = acquireBulkRefetch(lock);
	expect(releaseBulk).toBeFunction();
	expect(acquireBulkRefetch(lock)).toBeUndefined();
	expect(acquirePluginRefetch(lock, "plugin-a")).toBeUndefined();

	releaseBulk?.();
	const releasePlugin = acquirePluginRefetch(lock, "plugin-a");
	expect(releasePlugin).toBeFunction();
	expect(acquirePluginRefetch(lock, "plugin-a")).toBeUndefined();
	expect(acquireBulkRefetch(lock)).toBeUndefined();

	releasePlugin?.();
	expect(acquireBulkRefetch(lock)).toBeFunction();
});

test("allows separate single-plugin refetches and releases keys once", () => {
	const lock = createRefetchLockState();
	const releaseFirst = acquirePluginRefetch(lock, "plugin-a");
	const releaseSecond = acquirePluginRefetch(lock, "plugin-b");
	expect(releaseFirst).toBeFunction();
	expect(releaseSecond).toBeFunction();
	releaseFirst?.();
	releaseFirst?.();
	expect(acquirePluginRefetch(lock, "plugin-a")).toBeFunction();
	expect(acquireBulkRefetch(lock)).toBeUndefined();
});