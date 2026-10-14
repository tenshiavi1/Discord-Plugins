import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

export const ACTIVITY_TYPES = [
	{ label: "Playing", value: 0 },
	{ label: "Streaming", value: 1 },
	{ label: "Listening", value: 2 },
	{ label: "Watching", value: 3 },
	{ label: "Competing", value: 5 },
] as const;

export const DISPLAY_TYPES = [
	{ label: "Name", value: 0 },
	{ label: "State", value: 1 },
	{ label: "Details", value: 2 },
] as const;

export const TIMESTAMP_MODES = [
	{ label: "Since last connection", value: "connection" },
	{ label: "Since last presence update", value: "update" },
	{ label: "Since Aura Control started", value: "startup" },
	{ label: "Your local time", value: "local" },
	{ label: "Custom timestamp", value: "custom" },
] as const;

const SOCKET_ID = "AuraControl@tenshiavi";
const PROCESS_ID = 1616;
const DEFAULT_APPLICATION_ID = "896771305108553788";
const MAX_TEXT_LENGTH = 128;
const dispatcher = FluxDispatcher ?? findByProps("dispatch", "subscribe");
const applicationAssets = findByProps("fetchAssetIds");
let pluginStartedAt = Date.now();

export type ActivityConfiguration = {
	enabled: boolean;
	applicationId: string;
	applicationName: string;
	activityType: number;
	displayType: number;
	details: string;
	detailsUrl: string;
	state: string;
	stateUrl: string;
	streamUrl: string;
	timestampMode: string;
	timestampConnection: number;
	timestampLastUpdate: number;
	timestampCustomStart: string;
	timestampCustomEnd: string;
	timestampEndEnabled: boolean;
	largeImageKey: string;
	largeImageText: string;
	largeImageUrl: string;
	smallImageKey: string;
	smallImageText: string;
	smallImageUrl: string;
	buttonOneLabel: string;
	buttonOneUrl: string;
	buttonTwoLabel: string;
	buttonTwoUrl: string;
	partySize: string;
	partyMaxSize: string;
};

export function validateConfiguration(config: ActivityConfiguration): string[] {
	const errors: string[] = [];
	if (!config.applicationName.trim()) errors.push("Enter an activity name.");
	if (config.applicationName.length > MAX_TEXT_LENGTH) errors.push("Activity name must be 128 characters or fewer.");
	if (config.applicationId && !/^\d{16,21}$/.test(config.applicationId)) {
		errors.push("Application ID must be a 16–21 digit Discord application ID.");
	}
	if (!ACTIVITY_TYPES.some((type) => type.value === config.activityType)) errors.push("Choose a supported activity type.");
	if (!DISPLAY_TYPES.some((type) => type.value === config.displayType)) errors.push("Choose a supported display type.");
	if (config.details.length > MAX_TEXT_LENGTH) errors.push("Details must be 128 characters or fewer.");
	if (config.detailsUrl && !isHttpUrl(config.detailsUrl)) errors.push("Details URL must start with http:// or https://.");
	if (config.state.length > MAX_TEXT_LENGTH) errors.push("State must be 128 characters or fewer.");
	if (config.stateUrl && !isHttpUrl(config.stateUrl)) errors.push("State URL must start with http:// or https://.");
	if (config.activityType === 1 && !/^https?:\/\/(www\.)?(twitch\.tv|youtube\.com)\//i.test(config.streamUrl)) {
		errors.push("Streaming activities need a Twitch or YouTube URL.");
	}
	if (!["connection", "update", "startup", "local", "custom"].includes(config.timestampMode)) {
		errors.push("Choose a supported timestamp mode.");
	}
	if (config.streamUrl && !isHttpUrl(config.streamUrl)) errors.push("Stream URL must start with http:// or https://.");
	if (config.largeImageKey.length > 256 || config.smallImageKey.length > 256) {
		errors.push("Image asset keys must be 256 characters or fewer.");
	}
	if (config.largeImageUrl && !isHttpUrl(config.largeImageUrl)) errors.push("Large image URL must start with http:// or https://.");
	if (config.smallImageUrl && !isHttpUrl(config.smallImageUrl)) errors.push("Small image URL must start with http:// or https://.");
	if (config.largeImageText.length > MAX_TEXT_LENGTH || config.smallImageText.length > MAX_TEXT_LENGTH) {
		errors.push("Image hover text must be 128 characters or fewer.");
	}
	for (const [label, url] of [
		[config.buttonOneLabel, config.buttonOneUrl],
		[config.buttonTwoLabel, config.buttonTwoUrl],
	] as const) {
		if (label && label.length > 32) errors.push("Button labels must be 32 characters or fewer.");
		if (Boolean(label) !== Boolean(url)) errors.push("Each button needs both a label and a URL.");
		if (url && !isHttpUrl(url)) errors.push("Button URLs must start with http:// or https://.");
	}
	const partySize = parseOptionalPositiveInteger(config.partySize);
	const partyMaxSize = parseOptionalPositiveInteger(config.partyMaxSize);
	if (partySize === null || partyMaxSize === null) errors.push("Party sizes must be positive whole numbers.");
	if ((partySize || partyMaxSize) && (!partySize || !partyMaxSize || partySize > partyMaxSize)) {
		errors.push("Enter both party sizes, and make sure the current size does not exceed the maximum.");
	}
	if (config.timestampMode === "custom" && !parseDate(config.timestampCustomStart)) {
		errors.push("Enter a valid custom timestamp start using YYYY-MM-DD HH:MM.");
	}
	if (config.timestampMode === "custom" && config.timestampEndEnabled) {
		const start = parseDate(config.timestampCustomStart);
		const end = parseDate(config.timestampCustomEnd);
		if (!end) errors.push("Enter a valid custom timestamp end using YYYY-MM-DD HH:MM.");
		else if (start && end <= start) errors.push("The custom end time must be later than the start time.");
	}
	return errors;
}

export async function createActivity(config: ActivityConfiguration): Promise<Record<string, unknown> | null> {
	if (!config.enabled) return null;
	const errors = validateConfiguration(config);
	if (errors.length > 0) throw new Error(errors[0]);

	const activity: Record<string, unknown> = {
		name: config.applicationName.trim(),
		type: config.activityType,
		flags: 1,
	};
	const applicationId = config.applicationId || DEFAULT_APPLICATION_ID;
	activity.application_id = applicationId;
	if (config.details) activity.details = config.details;
	if (config.detailsUrl) activity.details_url = config.detailsUrl;
	if (config.state) activity.state = config.state;
	if (config.stateUrl) activity.state_url = config.stateUrl;
	activity.status_display_type = config.displayType;
	if (config.activityType === 1) activity.url = config.streamUrl;
	const timestamp = getTimestamp(config);
	if (timestamp) activity.timestamps = timestamp;

	const assets: Record<string, string> = {};
	if (config.largeImageKey) assets.large_image = await resolveAssetKey(config.largeImageKey, applicationId);
	if (config.largeImageText) assets.large_text = config.largeImageText;
	if (config.largeImageUrl) assets.large_url = config.largeImageUrl;
	if (config.smallImageKey) assets.small_image = await resolveAssetKey(config.smallImageKey, applicationId);
	if (config.smallImageText) assets.small_text = config.smallImageText;
	if (config.smallImageUrl) assets.small_url = config.smallImageUrl;
	if (Object.keys(assets).length > 0) activity.assets = assets;

	const buttons = [
		[config.buttonOneLabel, config.buttonOneUrl],
		[config.buttonTwoLabel, config.buttonTwoUrl],
	].filter(([label, url]) => Boolean(label && url));
	if (buttons.length > 0) {
		activity.buttons = buttons.map(([label]) => label);
		activity.metadata = { button_urls: buttons.map(([, url]) => url) };
	}

	const partySize = parseOptionalPositiveInteger(config.partySize);
	const partyMaxSize = parseOptionalPositiveInteger(config.partyMaxSize);
	if (partySize && partyMaxSize) activity.party = { size: [partySize, partyMaxSize] };
	return activity;
}

export async function publishActivity(): Promise<void> {
	if (typeof dispatcher?.dispatch !== "function") {
		throw new Error("Discord's activity dispatcher is unavailable.");
	}
	if (storage.enabled) storage.timestampLastUpdate = Date.now();
	const activity = await createActivity(storage as ActivityConfiguration);
	dispatcher.dispatch({
		type: "LOCAL_ACTIVITY_UPDATE",
		activity,
		pid: PROCESS_ID,
		socketId: SOCKET_ID,
	});
}

async function resolveAssetKey(key: string, applicationId: string): Promise<string> {
	if (!applicationAssets || typeof applicationAssets.fetchAssetIds !== "function") {
		throw new Error("Discord's application asset resolver is unavailable.");
	}
	const assetIds = await applicationAssets.fetchAssetIds(applicationId, [key]);
	const assetId = Array.isArray(assetIds) ? assetIds[0] : undefined;
	if (typeof assetId !== "string" || assetId.length === 0) {
		throw new Error(`No Rich Presence image asset named "${key}" was found for this application.`);
	}
	return assetId;
}

export function resetPluginStartTime(): void {
	pluginStartedAt = Date.now();
	storage.timestampConnection = pluginStartedAt;
}

function getTimestamp(config: ActivityConfiguration): { start?: number; end?: number } | undefined {
	switch (config.timestampMode) {
		case "connection":
			return { start: config.timestampConnection || pluginStartedAt };
		case "update":
			return { start: config.timestampLastUpdate || Date.now() };
		case "startup":
			return { start: pluginStartedAt };
		case "local": {
			const now = new Date();
			now.setHours(0, 0, 0, 0);
			return { start: now.getTime() };
		}
		case "custom": {
			const start = parseDate(config.timestampCustomStart);
			const end = config.timestampEndEnabled ? parseDate(config.timestampCustomEnd) : undefined;
			return start ? { start, ...(end ? { end } : {}) } : undefined;
		}
		default:
			return undefined;
	}
}

function isHttpUrl(value: string): boolean {
	return /^https?:\/\/\S+$/i.test(value);
}

function parseDate(value: string): number | undefined {
	if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return undefined;
	const timestamp = new Date(value.replace(" ", "T")).getTime();
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseOptionalPositiveInteger(value: string): number | null {
	if (!value) return 0;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
