import { React, ReactNative as RN } from "@vendetta/metro/common";
import {
	ACTIVITY_TYPES,
	DISPLAY_TYPES,
	resolvePreviewAssetUrl,
	type ActivityConfiguration,
} from "./activity";
import { parseLocalDateTime } from "./dateTime";

type ImageStatus = "empty" | "loading" | "ready" | "failed";

function usePreviewImage(value: string, applicationId: string) {
	const [image, setImage] = React.useState<{ uri: string; status: ImageStatus }>({ uri: "", status: "empty" });

	React.useEffect(() => {
		let cancelled = false;
		const key = value.trim();
		if (!key) {
			setImage({ uri: "", status: "empty" });
			return () => { cancelled = true; };
		}
		if (/^https?:\/\//i.test(key)) {
			setImage({ uri: key, status: "ready" });
			return () => { cancelled = true; };
		}

		setImage({ uri: "", status: "loading" });
		const timer = setTimeout(() => {
			void resolvePreviewAssetUrl(key, applicationId).then((uri) => {
				if (!cancelled) setImage({ uri, status: "ready" });
			}).catch(() => {
				if (!cancelled) setImage({ uri: "", status: "failed" });
			});
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [value, applicationId]);

	return {
		...image,
		setFailed: () => setImage((current: { uri: string; status: ImageStatus }) => ({ ...current, status: "failed" })),
	};
}

function PreviewImage({ value, applicationId, fallback, size }: {
	value: string;
	applicationId: string;
	fallback: string;
	size: number;
}) {
	const image = usePreviewImage(value, applicationId);
	const showImage = image.status === "ready" && Boolean(image.uri);
	return (
		<RN.View style={{ width: size, height: size, overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#1e1f22" }}>
			{showImage ? (
				<RN.Image
					source={{ uri: image.uri }}
					resizeMode="cover"
					onError={image.setFailed}
					style={{ width: size, height: size }}
				/>
			) : image.status === "loading" ? (
				<RN.ActivityIndicator size="small" color="#b5bac1" />
			) : (
				<RN.Text style={{ color: "#b5bac1", fontSize: size < 40 ? 12 : 24, fontWeight: "700" }}>
					{image.status === "failed" ? "!" : fallback}
				</RN.Text>
			)}
		</RN.View>
	);
}

function isHttpUrl(value: string) {
	return /^https?:\/\/\S+$/i.test(value);
}

function getHost(value: string) {
	try {
		return new URL(value).hostname.replace(/^www\./i, "");
	} catch {
		return "";
	}
}

function formatDuration(milliseconds: number) {
	const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	if (days) return `${days}d ${hours}h`;
	if (hours) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function getTimestampLabel(config: ActivityConfiguration, now: number) {
	let start: number | undefined;
	switch (config.timestampMode) {
		case "connection": start = Number(config.timestampConnection) || now; break;
		case "update": start = Number(config.timestampLastUpdate) || now; break;
		case "startup": start = Number(config.timestampStartup) || now; break;
		case "local": {
			const midnight = new Date(now);
			midnight.setHours(0, 0, 0, 0);
			start = midnight.getTime();
			break;
		}
		case "custom": start = parseLocalDateTime(config.timestampCustomStart)?.getTime(); break;
	}
	if (start === undefined) return "Choose a start time to preview the timestamp.";

	const elapsed = `Elapsed ${formatDuration(now - start)}`;
	if (config.timestampMode !== "custom" || !config.timestampEndEnabled) return elapsed;
	const end = parseLocalDateTime(config.timestampCustomEnd)?.getTime();
	return end === undefined ? elapsed : `${elapsed} · Ends ${new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function PresenceButton({ label, url }: { label: string; url: string }) {
	return (
		<RN.View style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: "#5865f2" }}>
			<RN.Text numberOfLines={1} style={{ color: "#ffffff", fontSize: 12, fontWeight: "600" }}>{label}</RN.Text>
			<RN.Text numberOfLines={1} style={{ color: "#d9dcff", fontSize: 9 }}>{getHost(url)}</RN.Text>
		</RN.View>
	);
}

export default function PresencePreview({ config }: { config: ActivityConfiguration }) {
	const [now, setNow] = React.useState(Date.now());
	React.useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);

	const applicationName = config.applicationName.trim() || "My Activity";
	const activityType = ACTIVITY_TYPES.find((type) => type.value === Number(config.activityType))?.label ?? "Playing";
	const displayType = DISPLAY_TYPES.find((type) => type.value === Number(config.displayType))?.label ?? "Name";
	const applicationId = config.applicationId || "896771305108553788";
	const primaryValue = displayType === "State"
		? config.state.trim()
		: displayType === "Details"
			? config.details.trim()
			: applicationName;
	const secondaryValues = [
		...(displayType !== "Name" && applicationName ? [applicationName] : []),
		...(displayType !== "Details" && config.details.trim() ? [config.details.trim()] : []),
		...(displayType !== "State" && config.state.trim() ? [config.state.trim()] : []),
	].filter((value, index, values) => value !== primaryValue && values.indexOf(value) === index);
	const buttons = [
		{ label: config.buttonOneLabel.trim(), url: config.buttonOneUrl.trim() },
		{ label: config.buttonTwoLabel.trim(), url: config.buttonTwoUrl.trim() },
	];
	const validButtons = buttons.filter((button) => button.label && isHttpUrl(button.url));
	const hasIncompleteButton = buttons.some((button) => Boolean(button.label) !== Boolean(button.url) || (button.url && !isHttpUrl(button.url)));
	const partySize = Number(config.partySize);
	const partyMaxSize = Number(config.partyMaxSize);
	const partyLabel = Number.isSafeInteger(partySize) && partySize > 0 && Number.isSafeInteger(partyMaxSize) && partyMaxSize >= partySize
		? `Party ${partySize}/${partyMaxSize}`
		: "";
	const streamHost = config.activityType === 1 && isHttpUrl(config.streamUrl) ? getHost(config.streamUrl) : "";
	const largeHover = config.largeImageText.trim();
	const smallHover = config.smallImageText.trim();

	return (
		<RN.View style={{ marginHorizontal: 8, overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: "#1e1f22", backgroundColor: "#232428" }}>
			<RN.View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#3f4147" }}>
				<RN.Text style={{ color: "#b5bac1", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>RICH PRESENCE PREVIEW</RN.Text>
				<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
					<RN.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: config.enabled ? "#23a55a" : "#80848e" }} />
					<RN.Text style={{ color: "#b5bac1", fontSize: 11 }}>{config.enabled ? "Connected" : "Preview"}</RN.Text>
				</RN.View>
			</RN.View>
			<RN.View style={{ flexDirection: "row", gap: 12, padding: 14 }}>
				<RN.View style={{ flex: 1, minWidth: 0 }}>
					<RN.View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 5, rowGap: 2, marginBottom: 7 }}>
						<RN.Text style={{ color: "#f2f3f5", fontSize: 13, fontWeight: "600" }}>Alex</RN.Text>
						<RN.Text style={{ color: "#b5bac1", fontSize: 12 }}>is {activityType.toLowerCase()}</RN.Text>
					</RN.View>
					<RN.Text numberOfLines={2} style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "700" }}>{primaryValue || "Add details or state"}</RN.Text>
					{secondaryValues.map((value, index) => (
						<RN.Text key={`${value}-${index}`} numberOfLines={2} style={{ marginTop: 3, color: "#b5bac1", fontSize: 13 }}>
							{value}
							{value === config.details.trim() && isHttpUrl(config.detailsUrl) ? <RN.Text style={{ color: "#949ba4", fontSize: 10 }}> · {getHost(config.detailsUrl)}</RN.Text> : null}
							{value === config.state.trim() && isHttpUrl(config.stateUrl) ? <RN.Text style={{ color: "#949ba4", fontSize: 10 }}> · {getHost(config.stateUrl)}</RN.Text> : null}
						</RN.Text>
					))}
					<RN.Text style={{ marginTop: 7, color: "#949ba4", fontSize: 11 }}>{displayType} display · {getTimestampLabel(config, now)}</RN.Text>
					{partyLabel ? <RN.Text style={{ marginTop: 3, color: "#b5bac1", fontSize: 11 }}>{partyLabel}</RN.Text> : null}
					{streamHost ? <RN.Text numberOfLines={1} style={{ marginTop: 3, color: "#b5bac1", fontSize: 11 }}>Streaming on {streamHost}</RN.Text> : null}
				</RN.View>
				<RN.View style={{ width: 88, height: 88 }}>
					<PreviewImage value={config.largeImageKey} applicationId={applicationId} fallback={applicationName.slice(0, 2).toUpperCase()} size={88} />
					{config.smallImageKey.trim() ? (
						<RN.View style={{ position: "absolute", right: -3, bottom: -3, padding: 2, borderRadius: 9, backgroundColor: "#232428" }}>
							<PreviewImage value={config.smallImageKey} applicationId={applicationId} fallback="+" size={32} />
						</RN.View>
					) : null}
				</RN.View>
			</RN.View>
			{(largeHover || smallHover || config.largeImageUrl || config.smallImageUrl) ? (
				<RN.View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
					{largeHover ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Large hover: {largeHover}</RN.Text> : null}
					{smallHover ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Small hover: {smallHover}</RN.Text> : null}
					{config.largeImageUrl ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Large image opens {getHost(config.largeImageUrl)}</RN.Text> : null}
					{config.smallImageUrl ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Small image opens {getHost(config.smallImageUrl)}</RN.Text> : null}
				</RN.View>
			) : null}
			{validButtons.length > 0 ? (
				<RN.View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
					{validButtons.map((button, index) => <PresenceButton key={`${index}-${button.label}`} label={button.label} url={button.url} />)}
				</RN.View>
			) : null}
			{hasIncompleteButton ? (
				<RN.Text style={{ paddingHorizontal: 14, paddingBottom: 10, color: "#f0b232", fontSize: 11 }}>A button appears when both its label and a valid URL are set.</RN.Text>
			) : null}
		</RN.View>
	);
}