const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export function parseLocalDateTime(value: string): Date | undefined {
	const match = LOCAL_DATE_TIME_PATTERN.exec(value);
	if (!match) return undefined;

	const [, yearText, monthText, dayText, hourText, minuteText] = match;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const hour = Number(hourText);
	const minute = Number(minuteText);
	if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return undefined;

	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(hour, minute, 0, 0);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day ||
		date.getHours() !== hour ||
		date.getMinutes() !== minute
	) {
		return undefined;
	}
	return date;
}

export function formatLocalDateTime(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${String(date.getFullYear()).padStart(4, "0")}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function getCalendarDates(year: number, month: number): Date[] {
	const firstWeekday = new Date(year, month, 1).getDay();
	return Array.from(
		{ length: 42 },
		(_, index) => new Date(year, month, 1 - firstWeekday + index),
	);
}