import { expect, test } from "bun:test";
import { formatLocalDateTime, getCalendarDates, parseLocalDateTime } from "./dateTime";

test("parses and formats local date-times without changing the wall clock", () => {
	const date = parseLocalDateTime("2026-10-16 19:05");
	expect(date).toBeInstanceOf(Date);
	expect(formatLocalDateTime(date!)).toBe("2026-10-16 19:05");
});

test("rejects malformed and impossible local date-times", () => {
	expect(parseLocalDateTime("2026-02-31 19:05")).toBeUndefined();
	expect(parseLocalDateTime("0000-01-01 00:00")).toBeUndefined();
	expect(parseLocalDateTime("2026-13-01 19:05")).toBeUndefined();
	expect(parseLocalDateTime("2026-10-16 24:00")).toBeUndefined();
	expect(parseLocalDateTime("2026-10-16T19:05")).toBeUndefined();
});

test("returns a Sunday-aligned six-week calendar grid", () => {
	const dates = getCalendarDates(2026, 9);
	expect(dates).toHaveLength(42);
	expect(dates[0].getDay()).toBe(0);
	expect(dates[0].getMonth()).toBe(8);
	expect(dates[dates.length - 1].getMonth()).toBe(10);
});

test("keeps years below 100 instead of remapping them to the 1900s", () => {
	const dates = getCalendarDates(42, 1);
	const februaryDates = dates.filter((date) => date.getFullYear() === 42 && date.getMonth() === 1);
	expect(februaryDates).toHaveLength(28);
	expect(februaryDates[0].getDate()).toBe(1);
	expect(februaryDates[februaryDates.length - 1].getDate()).toBe(28);
});