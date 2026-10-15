import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { findByProps } from "../../compat";
import { showToast } from "../../shared/toast";
import StableTextInput from "../../StableTextInput";
import {
	ACTIVITY_TYPES,
	DISPLAY_TYPES,
	clearActivity,
	publishActivity,
	resetPluginStartTime,
	TIMESTAMP_MODES,
	validateConfiguration,
	type ActivityConfiguration,
} from "./activity";
import { formatLocalDateTime, getCalendarDates, parseLocalDateTime } from "./dateTime";

const { TableRow, TableRowGroup, TableSwitchRow, Stack } = findByProps(
	"TableRow",
	"TableRowGroup",
	"TableSwitchRow",
	"Stack",
);

function TextSetting({ label, storageKey, placeholder, limit = 128 }: {
	label: string;
	storageKey: string;
	placeholder?: string;
	limit?: number;
}) {
	return (
		<RN.View style={{ padding: 10 }}>
			<RN.Text style={{ color: "#f2f3f5", fontSize: 14, marginBottom: 6 }}>{label}</RN.Text>
			<StableTextInput
				key={storageKey}
				value={typeof storage[storageKey] === "string" ? storage[storageKey] : ""}
				placeholder={placeholder ?? label}
				keyboardType={storageKey === "partySize" || storageKey === "partyMaxSize" ? "numeric" : "default"}
				maxLength={limit}
				onChangeText={(value: string) => { storage[storageKey] = value; }}
				style={{
					color: "#f2f3f5",
					backgroundColor: "#1e1f22",
					borderRadius: 8,
					paddingHorizontal: 12,
					paddingVertical: 10,
				}}
			/>
		</RN.View>
	);
}

const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, index) =>
	new Date(2023, 0, 1 + index).toLocaleDateString(undefined, { weekday: "short" }),
);

function roundedCurrentTime() {
	const date = new Date();
	date.setSeconds(0, 0);
	return date;
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function TimeStepper({ label, value, max, onChange }: {
	label: string;
	value: number;
	max: number;
	onChange: (value: number) => void;
}) {
	const formattedValue = String(value).padStart(2, "0");
	const [draft, setDraft] = React.useState(formattedValue);
	React.useEffect(() => setDraft(formattedValue), [formattedValue]);
	const commitDraft = () => {
		const nextValue = Number(draft);
		if (!/^\d{1,2}$/.test(draft) || nextValue < 0 || nextValue > max) {
			showToast(`${label} must be between 00 and ${String(max).padStart(2, "0")}.`);
			setDraft(formattedValue);
			return;
		}
		onChange(nextValue);
		setDraft(String(nextValue).padStart(2, "0"));
	};
	const step = (amount: number) => onChange((value + amount + max + 1) % (max + 1));

	return (
		<RN.View style={{ alignItems: "center", gap: 6 }}>
			<RN.Text style={{ color: "#b5bac1", fontSize: 12 }}>{label}</RN.Text>
			<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
				<RN.TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel={`Decrease ${label.toLowerCase()}`}
					onPress={() => step(-1)}
					style={{ width: 32, height: 36, borderRadius: 8, backgroundColor: "#34363c", alignItems: "center", justifyContent: "center" }}
				>
					<RN.Text style={{ color: "#f2f3f5", fontSize: 20 }}>-</RN.Text>
				</RN.TouchableOpacity>
				<RN.TextInput
					accessibilityLabel={label}
					accessibilityHint={`Enter a value from 00 to ${String(max).padStart(2, "0")}.`}
					keyboardType="number-pad"
					maxLength={2}
					selectTextOnFocus
					value={draft}
					onChangeText={(nextValue: string) => {
						if (!/^\d{0,2}$/.test(nextValue)) return;
						setDraft(nextValue);
						const parsedValue = Number(nextValue);
						if (nextValue.length === 2 && parsedValue <= max) onChange(parsedValue);
					}}
					onEndEditing={commitDraft}
					style={{ width: 40, paddingVertical: 4, color: "#f2f3f5", backgroundColor: "#1e1f22", borderRadius: 6, fontSize: 20, fontVariant: ["tabular-nums"], textAlign: "center" }}
				/>
				<RN.TouchableOpacity
					accessibilityRole="button"
					accessibilityLabel={`Increase ${label.toLowerCase()}`}
					onPress={() => step(1)}
					style={{ width: 32, height: 36, borderRadius: 8, backgroundColor: "#34363c", alignItems: "center", justifyContent: "center" }}
				>
					<RN.Text style={{ color: "#f2f3f5", fontSize: 20 }}>+</RN.Text>
				</RN.TouchableOpacity>
			</RN.View>
		</RN.View>
	);
}

function DateTimeSetting({ label, storageKey }: { label: string; storageKey: string }) {
	const storedValue = typeof storage[storageKey] === "string" ? storage[storageKey] as string : "";
	const [visible, setVisible] = React.useState(false);
	const [selectedDate, setSelectedDate] = React.useState(() =>
		parseLocalDateTime(storedValue) ?? roundedCurrentTime(),
	);
	const [displayMonth, setDisplayMonth] = React.useState(() =>
		startOfMonth(parseLocalDateTime(storedValue) ?? roundedCurrentTime()),
	);
	const savedDate = parseLocalDateTime(storedValue);
	const timeLabel = (date: Date) =>
		`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	const summary = savedDate
		? `${savedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${timeLabel(savedDate)} local time`
		: "Choose a local date and time.";
	const calendarDates = getCalendarDates(displayMonth.getFullYear(), displayMonth.getMonth());

	const openPicker = () => {
		const initialDate = parseLocalDateTime(storedValue) ?? roundedCurrentTime();
		setSelectedDate(initialDate);
		setDisplayMonth(startOfMonth(initialDate));
		setVisible(true);
	};
	const changeMonth = (amount: number) => {
		setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
	};
	const selectDate = (date: Date) => {
		const nextDate = new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			selectedDate.getHours(),
			selectedDate.getMinutes(),
		);
		setSelectedDate(nextDate);
		setDisplayMonth(startOfMonth(nextDate));
	};
	const setTimeValue = (unit: "hours" | "minutes", value: number) => {
		const nextDate = new Date(selectedDate);
		if (unit === "hours") nextDate.setHours(value);
		else nextDate.setMinutes(value);
		setSelectedDate(nextDate);
		setDisplayMonth(startOfMonth(nextDate));
	};
	const saveDate = () => {
		const startDate = parseLocalDateTime(String(storage.timestampCustomStart ?? ""));
		const endDate = parseLocalDateTime(String(storage.timestampCustomEnd ?? ""));
		if (storageKey === "timestampCustomEnd" && startDate && selectedDate <= startDate) {
			showToast("Choose an end time after the start time.");
			return;
		}
		if (
			storageKey === "timestampCustomStart" &&
			storage.timestampEndEnabled &&
			endDate &&
			selectedDate >= endDate
		) {
			showToast("Choose a start time before the end time.");
			return;
		}
		storage[storageKey] = formatLocalDateTime(selectedDate);
		setVisible(false);
	};

	return (
		<RN.View>
			<TableRow
				label={label}
				subLabel={summary}
				trailing={<TableRow.Arrow />}
				onPress={openPicker}
			/>
			<RN.Modal
				visible={visible}
				transparent
				animationType="slide"
				onRequestClose={() => setVisible(false)}
			>
				<RN.View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.64)" }}>
					<RN.TouchableOpacity
						accessible={false}
						onPress={() => setVisible(false)}
						style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
					/>
					<RN.View style={{ width: "100%", maxWidth: 440, maxHeight: "94%", alignSelf: "center", borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: "#232428", overflow: "hidden" }}>
						<RN.ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
							<RN.Text style={{ color: "#f2f3f5", fontSize: 18, fontWeight: "700" }}>{label}</RN.Text>
							<RN.Text style={{ marginTop: 4, color: "#b5bac1", fontSize: 13 }}>Choose a date and 24-hour local time.</RN.Text>
							<RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, marginBottom: 10 }}>
								<RN.TouchableOpacity
									accessibilityRole="button"
									accessibilityLabel="Previous month"
									onPress={() => changeMonth(-1)}
									style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#34363c", alignItems: "center", justifyContent: "center" }}
								>
									<RN.Text style={{ color: "#f2f3f5", fontSize: 18 }}>&lt;</RN.Text>
								</RN.TouchableOpacity>
								<RN.Text style={{ color: "#f2f3f5", fontSize: 16, fontWeight: "600" }}>
									{displayMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
								</RN.Text>
								<RN.TouchableOpacity
									accessibilityRole="button"
									accessibilityLabel="Next month"
									onPress={() => changeMonth(1)}
									style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#34363c", alignItems: "center", justifyContent: "center" }}
								>
									<RN.Text style={{ color: "#f2f3f5", fontSize: 18 }}>&gt;</RN.Text>
								</RN.TouchableOpacity>
							</RN.View>
							<RN.View style={{ flexDirection: "row", flexWrap: "wrap" }}>
								{WEEKDAY_LABELS.map((weekday, index) => (
									<RN.Text key={`weekday-${index}`} style={{ width: "14.2857%", paddingVertical: 8, color: "#949ba4", fontSize: 12, textAlign: "center" }}>
										{weekday}
									</RN.Text>
								))}
								{calendarDates.map((date) => {
									const isSelected = date.getFullYear() === selectedDate.getFullYear()
										&& date.getMonth() === selectedDate.getMonth()
										&& date.getDate() === selectedDate.getDate();
									const isCurrentMonth = date.getMonth() === displayMonth.getMonth();
									const isToday = date.toDateString() === new Date().toDateString();
									return (
										<RN.TouchableOpacity
											key={date.getTime()}
											accessibilityRole="button"
											accessibilityLabel={date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
											accessibilityState={{ selected: isSelected }}
											onPress={() => selectDate(date)}
											style={{ width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: isSelected ? "#5865f2" : "transparent", borderWidth: isToday && !isSelected ? 1 : 0, borderColor: "#5865f2" }}
										>
											<RN.Text style={{ color: isSelected ? "#ffffff" : isCurrentMonth ? "#f2f3f5" : "#72767d", fontSize: 14 }}>
												{date.getDate()}
											</RN.Text>
										</RN.TouchableOpacity>
									);
								})}
							</RN.View>
							<RN.View style={{ marginTop: 18, padding: 12, borderRadius: 10, backgroundColor: "#1e1f22" }}>
								<RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
									<RN.Text style={{ color: "#949ba4", fontSize: 12 }}>Selected date</RN.Text>
									<RN.Text style={{ marginTop: 4, color: "#f2f3f5", fontSize: 14, fontWeight: "600" }}>
										{selectedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
									</RN.Text>
								</RN.View>
								<RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 12 }}>
									<TimeStepper label="Hour" value={selectedDate.getHours()} max={23} onChange={(value) => setTimeValue("hours", value)} />
									<RN.Text style={{ color: "#f2f3f5", fontSize: 20, fontWeight: "600" }}>:</RN.Text>
									<TimeStepper label="Minute" value={selectedDate.getMinutes()} max={59} onChange={(value) => setTimeValue("minutes", value)} />
								</RN.View>
							</RN.View>
							<RN.View style={{ flexDirection: "row", alignItems: "center", marginTop: 18, gap: 8 }}>
								<RN.TouchableOpacity
									accessibilityRole="button"
									onPress={() => {
										const today = roundedCurrentTime();
										setSelectedDate(today);
										setDisplayMonth(startOfMonth(today));
									}}
									style={{ minHeight: 42, paddingHorizontal: 14, borderRadius: 8, justifyContent: "center", backgroundColor: "#34363c" }}
								>
									<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Today</RN.Text>
								</RN.TouchableOpacity>
								<RN.View style={{ flex: 1 }} />
								<RN.TouchableOpacity
									accessibilityRole="button"
									onPress={() => setVisible(false)}
									style={{ minHeight: 42, paddingHorizontal: 14, borderRadius: 8, justifyContent: "center", backgroundColor: "#34363c" }}
								>
									<RN.Text style={{ color: "#f2f3f5", fontWeight: "600" }}>Cancel</RN.Text>
								</RN.TouchableOpacity>
								<RN.TouchableOpacity
									accessibilityRole="button"
									onPress={saveDate}
									style={{ minHeight: 42, paddingHorizontal: 16, borderRadius: 8, justifyContent: "center", backgroundColor: "#5865f2" }}
								>
									<RN.Text style={{ color: "#ffffff", fontWeight: "600" }}>Done</RN.Text>
								</RN.TouchableOpacity>
							</RN.View>
						</RN.ScrollView>
					</RN.View>
				</RN.View>
			</RN.Modal>
		</RN.View>
	);
}

async function publishWithFeedback(successMessage: string): Promise<boolean> {
	const errors = validateConfiguration(storage as ActivityConfiguration);
	if (storage.enabled && errors.length > 0) {
		storage.enabled = false;
		try {
			clearActivity();
		} catch (error) {
			console.error("[Aura Control] Could not clear activity after validation failed.", error);
		}
		showToast(`Aura Control was disconnected because its configuration is invalid: ${errors[0]}`);
		return false;
	}
	try {
		await publishActivity();
		if (!storage.enabled) return false;
		showToast(successMessage);
		return true;
	} catch (error) {
		console.error("[Aura Control] Failed to update the activity.", error);
		storage.enabled = false;
		try {
			clearActivity();
		} catch (clearError) {
			console.error("[Aura Control] Could not clear activity after publishing failed.", clearError);
		}
		const reason = error instanceof Error
			? error.message.replace(/[.!?]+$/, "")
			: "an unexpected error occurred";
		showToast(`Aura Control was disconnected because the activity could not be updated: ${reason}.`);
		return false;
	}
}

async function connect(): Promise<void> {
	resetPluginStartTime();
	storage.enabled = true;
	await publishWithFeedback("Connected and publishing Aura Control activity.");
}

async function disconnect(): Promise<void> {
	storage.enabled = false;
	try {
		clearActivity();
		showToast("Aura Control disconnected, and its activity was cleared.");
	} catch (error) {
		console.error("[Aura Control] Could not disconnect the activity.", error);
		showToast("Aura Control disconnected, but Discord's activity could not be cleared.");
	}
}

async function updatePresence(): Promise<void> {
	if (!storage.enabled) {
		showToast("Connect Aura Control before updating the activity.");
		return;
	}
	await publishWithFeedback("Aura Control activity updated.");
}

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10, paddingBottom: 24 }}>
			<Stack spacing={8}>
			<TableRowGroup title="Application">
				<TextSetting label="Application ID (optional)" storageKey="applicationId" placeholder="Leave blank to use the default app." limit={21} />
				<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
					Leave blank to connect with the public default application. Enter your own ID to use assets uploaded to your application.
				</RN.Text>
				<TextSetting label="Name" storageKey="applicationName" placeholder="Enter an activity name." />
			</TableRowGroup>
			<TableRowGroup title="Activity Type">
				{ACTIVITY_TYPES.map((type) => (
					<TableRow
						key={`activity-type-${type.value}`}
						label={`${Number(storage.activityType) === type.value ? "(Selected) " : ""}${type.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.activityType = type.value; }}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup title="Display">
				{DISPLAY_TYPES.map((type) => (
					<TableRow
						key={`display-type-${type.value}`}
						label={`${Number(storage.displayType) === type.value ? "(Selected) " : ""}${type.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.displayType = type.value; }}
					/>
				))}
			</TableRowGroup>
			<TableRowGroup title="Details and State">
				<TextSetting label="Details" storageKey="details" placeholder="Optional activity details." />
				<TextSetting label="Details URL" storageKey="detailsUrl" placeholder="https://example.com/path" limit={512} />
				<TextSetting label="State" storageKey="state" placeholder="Optional activity state." />
				<TextSetting label="State URL" storageKey="stateUrl" placeholder="https://example.com/path" limit={512} />
				{storage.activityType === 1 && (
					<TextSetting label="Stream URL (Twitch or YouTube)" storageKey="streamUrl" placeholder="https://twitch.tv/channel" limit={512} />
				)}
			</TableRowGroup>
			<TableRowGroup title="Party">
				<TextSetting 				label="Current Party Size" storageKey="partySize" placeholder="Leave blank or enter a whole number." limit={9} />
				<TextSetting 				label="Maximum Party Size" storageKey="partyMaxSize" placeholder="Leave blank or enter a whole number." limit={9} />
			</TableRowGroup>
			<TableRowGroup title="Timestamp">
				<RN.Text style={{ color: "#b5bac1", padding: 12 }}>
				"Since Last Connection" starts when Aura Control is enabled in this session. Custom timestamps use your device's local time.
				</RN.Text>
				{TIMESTAMP_MODES.map((mode) => (
					<TableRow
						key={`timestamp-${mode.value}`}
						label={`${storage.timestampMode === mode.value ? "(Selected) " : ""}${mode.label}`}
						trailing={<TableRow.Arrow />}
						onPress={() => { storage.timestampMode = mode.value; }}
					/>
				))}
				{storage.timestampMode === "custom" && (
					<>
						<DateTimeSetting label="Start Time" storageKey="timestampCustomStart" />
						<TableSwitchRow
							label="Include End Time"
							value={Boolean(storage.timestampEndEnabled)}
							onValueChange={(value: boolean) => { storage.timestampEndEnabled = value; }}
						/>
						{storage.timestampEndEnabled && (
							<DateTimeSetting label="End Time" storageKey="timestampCustomEnd" />
						)}
					</>
				)}
			</TableRowGroup>
			<TableRowGroup title="Large Image">
				<RN.Text style={{ color: "#b5bac1", padding: 12 }}>
					Choose an asset key uploaded to this application's Rich Presence settings.
				</RN.Text>
				<TextSetting label="Key" storageKey="largeImageKey" placeholder="Asset key from your application." limit={256} />
				<TextSetting label="Text" storageKey="largeImageText" placeholder="Optional hover text." />
				<TextSetting label="URL" storageKey="largeImageUrl" placeholder="https://example.com/path" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Small Image">
				<TextSetting label="Key" storageKey="smallImageKey" placeholder="Asset key from your application." limit={256} />
				<TextSetting label="Text" storageKey="smallImageText" placeholder="Optional hover text." />
				<TextSetting label="URL" storageKey="smallImageUrl" placeholder="https://example.com/path" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Buttons">
				<TextSetting label="Button 1 Text" storageKey="buttonOneLabel" placeholder="Enter a label (32 characters max)." limit={32} />
				<TextSetting label="Button 1 URL" storageKey="buttonOneUrl" placeholder="https://example.com/path" limit={512} />
				<TextSetting label="Button 2 Text" storageKey="buttonTwoLabel" placeholder="Enter a label (32 characters max)." limit={32} />
				<TextSetting label="Button 2 URL" storageKey="buttonTwoUrl" placeholder="https://example.com/path" limit={512} />
			</TableRowGroup>
			<TableRowGroup title="Presence">
				<TableRow
					label="Activity Sharing"
					subLabel="Enable Activity Sharing in Discord privacy settings so other people can see this activity."
				/>
				<TableRow
					label="Connect"
					subLabel="Validate the configuration and start publishing."
					trailing={<TableRow.Arrow />}
					onPress={connect}
					disabled={Boolean(storage.enabled)}
				/>
				<TableRow
					label="Disconnect"
					subLabel="Clear Aura Control's activity."
					trailing={<TableRow.Arrow />}
					onPress={disconnect}
					disabled={!storage.enabled}
				/>
				<TableRow
					label="Update Presence"
					subLabel="Publish the latest configuration while connected."
					trailing={<TableRow.Arrow />}
					onPress={updatePresence}
					disabled={!storage.enabled}
				/>
			</TableRowGroup>
			</Stack>
		</RN.ScrollView>
	);
}
