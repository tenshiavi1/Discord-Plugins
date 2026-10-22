import { React, ReactNative as RN } from "@vendetta/metro/common";
import { getAssetIDByName } from "@vendetta/ui/assets";
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
			setImage({ uri: key, status: "loading" });
			return () => { cancelled = true; };
		}

		setImage({ uri: "", status: "loading" });
		const timer = setTimeout(() => {
			void resolvePreviewAssetUrl(key, applicationId).then((uri) => {
				if (!cancelled) setImage({ uri, status: "loading" });
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
		setLoaded: () => setImage((current: { uri: string; status: ImageStatus }) => ({ ...current, status: "ready" })),
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
	const showImage = Boolean(image.uri) && image.status !== "failed";
	return (
		<RN.View style={{ width: size, height: size, overflow: "hidden", alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#1e1f22" }}>
			{showImage ? (
				<>
					<RN.Image
						key={image.uri}
						source={{ uri: image.uri }}
						resizeMode="cover"
						onLoad={image.setLoaded}
						onError={image.setFailed}
						style={{ width: size, height: size }}
					/>
					{image.status === "loading" ? (
						<RN.View pointerEvents="none" style={{ position: "absolute", right: 0, bottom: 0, left: 0, height: 28, justifyContent: "center", backgroundColor: "#00000066" }}>
							<RN.ActivityIndicator size="small" color="#ffffff" />
						</RN.View>
					) : null}
				</>
			) : (
				<RN.View style={{ alignItems: "center", justifyContent: "center", gap: 4, padding: 4 }}>
					<RN.Text style={{ color: image.status === "failed" ? "#f0b232" : "#b5bac1", fontSize: size < 40 ? 12 : 24, fontWeight: "700" }}>
						{image.status === "failed" ? "!" : fallback}
					</RN.Text>
					{size >= 80 ? <RN.Text numberOfLines={2} style={{ color: "#949ba4", fontSize: 10, textAlign: "center" }}>{image.status === "failed" ? "Image unavailable" : "Add artwork"}</RN.Text> : null}
				</RN.View>
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

function formatElapsed(milliseconds: number) {
	const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimestampStart(config: ActivityConfiguration, now: number) {
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
	return start;
}

function PreviewSymbol({ asset, fallback, color }: { asset: string; fallback: string; color: string }) {
	const source = getAssetIDByName(asset);
	return source
		? <RN.Image source={source} style={{ width: 18, height: 18, tintColor: color }} />
		: <RN.Text style={{ color, fontSize: 16, fontWeight: "700" }}>{fallback}</RN.Text>;
}

function getEndTimeLabel(config: ActivityConfiguration) {
	if (config.timestampMode !== "custom" || !config.timestampEndEnabled) return "";
	const end = parseLocalDateTime(config.timestampCustomEnd)?.getTime();
	return end === undefined ? "" : `Ends ${new Date(end).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function PresenceButton({ label, url }: { label: string; url: string }) {
	return (
		<RN.View style={{ minHeight: 34, justifyContent: "center", paddingHorizontal: 12, borderRadius: 6, backgroundColor: "#3b3d42" }}>
			<RN.Text numberOfLines={1} style={{ color: "#f2f3f5", fontSize: 12, fontWeight: "600" }}>{label}</RN.Text>
			<RN.Text numberOfLines={1} style={{ color: "#b5bac1", fontSize: 9 }}>{getHost(url)}</RN.Text>
		</RN.View>
	);
}

export default function PresencePreview({ config }: { config: ActivityConfiguration }) {
	const [now, setNow] = React.useState(Date.now());
	React.useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);

	const width = RN.useWindowDimensions().width;
	const imageSize = Math.min(144, Math.max(92, Math.round((width - 72) * 0.34)));
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
	const partySize = Number(config.partySize);
	const partyMaxSize = Number(config.partyMaxSize);
	const hasParty = Number.isSafeInteger(partySize) && partySize > 0
		&& Number.isSafeInteger(partyMaxSize) && partyMaxSize >= partySize;
	const partyText = config.state.trim()
		? `${config.state.trim()}${hasParty ? ` (${partySize} of ${partyMaxSize})` : ""}`
		: hasParty ? `Party (${partySize} of ${partyMaxSize})` : "";
	const timestampStart = getTimestampStart(config, now);
	const timestamp = timestampStart === undefined ? "Set a valid timestamp start" : formatElapsed(now - timestampStart);
	const endTime = getEndTimeLabel(config);
	const streamHost = config.activityType === 1 && isHttpUrl(config.streamUrl) ? getHost(config.streamUrl) : "";
	const buttons = [
		{ label: config.buttonOneLabel.trim(), url: config.buttonOneUrl.trim() },
		{ label: config.buttonTwoLabel.trim(), url: config.buttonTwoUrl.trim() },
	];
	const validButtons = buttons.filter((button) => button.label && isHttpUrl(button.url));
	const hasIncompleteButton = buttons.some((button) => Boolean(button.label) !== Boolean(button.url) || (button.url && !isHttpUrl(button.url)));
	const largeHover = config.largeImageText.trim();
	const smallHover = config.smallImageText.trim();

	return (
		<RN.View style={{ marginHorizontal: 8, overflow: "hidden", borderRadius: 24, backgroundColor: "#1e1e1e" }}>
			<RN.Text style={{ paddingHorizontal: 22, paddingTop: 20, color: "#f2f3f5", fontSize: 22, fontWeight: "400" }}>{activityType}</RN.Text>
			<RN.View style={{ flexDirection: "row", alignItems: "flex-start", gap: 20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 22 }}>
				<RN.View style={{ width: imageSize, height: imageSize, flexShrink: 0 }}>
					<PreviewImage value={config.largeImageKey} applicationId={applicationId} fallback={applicationName.slice(0, 2).toUpperCase()} size={imageSize} />
					{config.smallImageKey.trim() ? (
						<RN.View style={{ position: "absolute", right: -5, bottom: -5, padding: 3, borderRadius: 12, backgroundColor: "#1e1e1e" }}>
							<PreviewImage value={config.smallImageKey} applicationId={applicationId} fallback="+" size={34} />
						</RN.View>
					) : null}
				</RN.View>
				<RN.View style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
					<RN.Text numberOfLines={1} style={{ color: "#f2f3f5", fontSize: 25, fontWeight: "700" }}>{primaryValue || applicationName}</RN.Text>
					{secondaryValues.map((value, index) => (
						<RN.Text key={`${value}-${index}`} numberOfLines={2} style={{ marginTop: 3, color: "#d7d9dc", fontSize: 16 }}>
							{value}
							{value === config.details.trim() && isHttpUrl(config.detailsUrl) ? <RN.Text style={{ color: "#b5bac1", fontSize: 11 }}> · {getHost(config.detailsUrl)}</RN.Text> : null}
							{value === config.state.trim() && isHttpUrl(config.stateUrl) ? <RN.Text style={{ color: "#b5bac1", fontSize: 11 }}> · {getHost(config.stateUrl)}</RN.Text> : null}
						</RN.Text>
					))}
					{partyText ? (
						<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 }}>
							<PreviewSymbol asset="GroupIcon" fallback="♟" color="#aeb0b5" />
							<RN.Text numberOfLines={2} style={{ flex: 1, color: "#aeb0b5", fontSize: 17 }}>{partyText}</RN.Text>
						</RN.View>
					) : null}
					<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: partyText ? 5 : 10 }}>
						<PreviewSymbol asset="GameControllerIcon" fallback="◆" color="#57c785" />
						<RN.Text style={{ color: "#57c785", fontSize: 20, fontVariant: ["tabular-nums"] }}>{timestamp}</RN.Text>
					</RN.View>
					{endTime ? <RN.Text style={{ marginTop: 3, color: "#949ba4", fontSize: 11 }}>{endTime}</RN.Text> : null}
					{streamHost ? <RN.Text numberOfLines={1} style={{ marginTop: 5, color: "#b5bac1", fontSize: 11 }}>Streaming on {streamHost}</RN.Text> : null}
				</RN.View>
			</RN.View>
			{(largeHover || smallHover || config.largeImageUrl || config.smallImageUrl) ? (
				<RN.View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
					{largeHover ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Large hover: {largeHover}</RN.Text> : null}
					{smallHover ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Small hover: {smallHover}</RN.Text> : null}
					{config.largeImageUrl ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Large image opens {getHost(config.largeImageUrl)}</RN.Text> : null}
					{config.smallImageUrl ? <RN.Text numberOfLines={1} style={{ color: "#949ba4", fontSize: 10 }}>Small image opens {getHost(config.smallImageUrl)}</RN.Text> : null}
				</RN.View>
			) : null}
			{validButtons.length > 0 ? (
				<RN.View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 20, paddingBottom: 16 }}>
					{validButtons.map((button, index) => <PresenceButton key={`${index}-${button.label}`} label={button.label} url={button.url} />)}
				</RN.View>
			) : null}
			{hasIncompleteButton ? (
				<RN.Text style={{ paddingHorizontal: 20, paddingBottom: 14, color: "#f0b232", fontSize: 11 }}>A button appears when both its label and a valid URL are set.</RN.Text>
			) : null}
		</RN.View>
	);
}