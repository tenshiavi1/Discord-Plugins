import { expect, test } from "bun:test";
import { countGroupedChannels } from "./serverInfoCounts";

test("counts channels across selectable and voice channel groups", () => {
	expect(countGroupedChannels({
		SELECTABLE: [{ id: "text-1" }, { id: "text-2" }],
		VOCAL: [{ id: "voice-1" }],
	})).toBe(3);
});

test("returns zero for empty groups and undefined for unavailable data", () => {
	expect(countGroupedChannels({ SELECTABLE: [], VOCAL: [] })).toBe(0);
	expect(countGroupedChannels(undefined)).toBeUndefined();
});
