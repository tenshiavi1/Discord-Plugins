import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { findByProps } from "../../compat";
import { showToast } from "../../shared/toast";
import {
	clearTranslations,
	getTranslationStatus,
	getTranslationTargetName,
	subscribeTranslations,
	updateTranslationSettings,
} from "./translations";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, TableSwitchRow, Stack } = findByProps(
	"TableSwitchRow",
	"TableRowGroup",
	"Stack",
	"TableRow",
);
const { Text } = findByProps("Text", "View");
const Press = RN.Pressable || RN.TouchableOpacity;

function useTranslationStatus() {
	const [status, setStatus] = React.useState(getTranslationStatus);
	React.useEffect(() => subscribeTranslations(() => setStatus(getTranslationStatus())), []);
	return status;
}

function Icon({ name, fallback, color = "#b5bac1" }: { name: string; fallback: string; color?: string }) {
	const asset = getAssetIDByName(name);
	return asset
		? <RN.Image source={asset} style={{ width: 18, height: 18, tintColor: color }} />
		: <Text style={{ color, fontSize: 18, fontWeight: "600" }}>{fallback}</Text>;
}

function Segmented({ value, options, onChange }: {
	value: string;
	options: [string, string][];
	onChange: (value: string) => void;
}) {
	return (
		<RN.View style={{ flexDirection: "row", padding: 3, gap: 3, borderRadius: 16, backgroundColor: "#1e1f22" }}>
			{options.map(([key, label]) => (
				<Press
					key={key}
					accessibilityRole="button"
					accessibilityState={{ selected: value === key }}
					onPress={() => onChange(key)}
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: 5,
						paddingHorizontal: 10,
						paddingVertical: 6,
						borderRadius: 13,
						backgroundColor: value === key ? "#4e5058" : "transparent",
					}}
				>
					<Icon name={key === "watch" ? "PlayIcon" : "HandRequestSpeakIcon"} fallback={key === "watch" ? "▶" : "↗"} color={value === key ? "#ffffff" : "#949ba4"} />
					<Text style={{ color: value === key ? "#ffffff" : "#949ba4", fontSize: 12, fontWeight: "600" }}>{label}</Text>
				</Press>
			))}
		</RN.View>
	);
}

function PreviewMessage({ children }: { children: unknown }) {
	return (
		<RN.View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
			<RN.View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "#faa61a" }}>
				<Text style={{ color: "#ffffff", fontWeight: "700" }}>L</Text>
			</RN.View>
			<RN.View style={{ flex: 1, minWidth: 0 }}>
				<RN.View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 3 }}>
					<Text style={{ color: "#f2f3f5", fontSize: 15, fontWeight: "600" }}>Lucía</Text>
					<Text style={{ color: "#949ba4", fontSize: 12, marginLeft: 8 }}>Today at 4:01 PM</Text>
				</RN.View>
				{children}
			</RN.View>
		</RN.View>
	);
}

function TranslationPreview({ enabled }: { enabled: boolean }) {
	const [mode, setMode] = React.useState<"watch" | "try">("watch");
	const [step, setStep] = React.useState(0);
	const [playing, setPlaying] = React.useState(true);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [manualDone, setManualDone] = React.useState(false);
	const manual = storage.translateMessagesMode === "manual";
	const showLanguage = storage.translateMessagesShowLanguage !== false;
	const showOriginal = storage.translateMessagesShowOriginal === true;
	const targetName = getTranslationTargetName(storage.translateMessagesTarget === "phone" ? "phone" : "discord");
	const watchedStep = manual ? step % 4 : step % 3;
	const done = mode === "watch" ? (manual ? watchedStep === 3 : watchedStep === 2) : manualDone;
	const busy = mode === "watch" && (manual ? watchedStep === 2 : watchedStep === 1);
	const watchedMenu = mode === "watch" && manual && watchedStep === 1;

	React.useEffect(() => {
		if (mode !== "watch" || !playing || !enabled) return undefined;
		const duration = watchedStep === 0 ? 1800 : watchedStep === 1 ? 1200 : 2400;
		const timer = setTimeout(() => setStep((current) => current + 1), duration);
		return () => clearTimeout(timer);
	}, [enabled, manual, mode, playing, watchedStep]);

	const translatedText = "Hi everyone! Who's coming tonight?";
	const originalText = "¡Hola a todos! ¿Quién viene esta noche?";
	const messageBody = busy ? (
		<RN.View>
			<Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 21 }}>{originalText}</Text>
			<Text style={{ color: "#949ba4", fontSize: 12, marginTop: 2 }}>Translating…</Text>
		</RN.View>
	) : done ? (
		<RN.View>
			<Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 21 }}>{translatedText}</Text>
			{showLanguage ? <Text style={{ color: "#949ba4", fontSize: 12, marginTop: 2 }}>{showOriginal ? "Translated from Spanish. Original:" : "Translated from Spanish"}</Text> : null}
			{showOriginal ? <RN.View style={{ marginTop: 5, paddingLeft: 9, borderLeftWidth: 2, borderLeftColor: "#4e5058" }}><Text style={{ color: "#949ba4", fontSize: 13 }}>{originalText}</Text></RN.View> : null}
		</RN.View>
	) : <Text style={{ color: "#dbdee1", fontSize: 15, lineHeight: 21 }}>{originalText}</Text>;
	const message = (
		<PreviewMessage>
			{messageBody}
		</PreviewMessage>
	);
	const frame = (
		<RN.View style={{ overflow: "hidden", borderRadius: 12, borderWidth: 1, borderColor: "#ffffff14", backgroundColor: "#1a1a1e" }}>
			<RN.View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#ffffff14" }}>
				<Text style={{ color: "#b5bac1", fontSize: 24 }}>‹</Text>
				<Text style={{ flex: 1, color: "#f2f3f5", fontSize: 15, fontWeight: "700" }}>#  general  ›</Text>
				<Icon name="ThreadIcon" fallback="⋯" />
				<Icon name="MagnifyingGlassIcon" fallback="⌕" />
			</RN.View>
			{mode === "try" && enabled ? (
				<Press
					accessibilityRole="button"
					accessibilityLabel="Open message actions"
					accessibilityHint="Hold the message to open its menu"
					onLongPress={() => setMenuOpen(true)}
					onPress={() => setMenuOpen((open) => !open)}
				>
					{message}
				</Press>
			) : message}
			{(watchedMenu || menuOpen) ? (
				<RN.View style={{ marginHorizontal: 14, marginBottom: 10, padding: 8, borderRadius: 14, backgroundColor: "#232428" }}>
					{["Reply", "Copy Text", done ? "Show original" : "Translate"].map((label) => (
						<Press key={label} accessibilityRole="button" onPress={() => {
							if (label === "Translate" || label === "Show original") {
								setManualDone(label === "Translate");
								setMenuOpen(false);
							}
						}} style={{ minHeight: 42, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10 }}>
							<Icon name={label === "Translate" || label === "Show original" ? "LanguageIcon" : "ReplyIcon"} fallback={label === "Translate" ? "文" : "↶"} />
							<Text style={{ color: "#f2f3f5", fontSize: 14 }}>{label}</Text>
						</Press>
					))}
				</RN.View>
			) : null}
			<RN.View style={{ height: 58, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#ffffff0f", backgroundColor: "#232428" }}>
				<RN.View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#b5bac1", fontSize: 20 }}>+</Text></RN.View>
				<RN.View style={{ flex: 1, height: 38, borderRadius: 19, justifyContent: "center", paddingHorizontal: 14, backgroundColor: "#2b2d31" }}><Text style={{ color: "#949ba4", fontSize: 13 }}>Message #general</Text></RN.View>
				<RN.View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#2b2d31", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#b5bac1" }}>◖</Text></RN.View>
			</RN.View>
		</RN.View>
	);
	const caption = !enabled ? "Translation is off in your options." : mode === "watch"
		? manual
			? watchedStep === 0 ? "Lucía writes in Spanish." : watchedStep === 1 ? "You hold the message to open its menu." : watchedStep === 2 ? "Tap Translate." : `The message now reads in ${targetName}.`
			: watchedStep === 0 ? "Lucía writes in Spanish." : watchedStep === 1 ? `Omniscience translates it into ${targetName}.` : `The message now reads in ${targetName}.`
		: manual ? "Hold the message and tap Translate, just like Discord's menu." : "Try holding the message to translate it or show the original.";

	return (
		<RN.View style={{ gap: 8 }}>
			<RN.View style={{ alignItems: "flex-end" }}>
				<Segmented value={mode} options={[["watch", "Watch"], ["try", "Try it"]]} onChange={(value) => { setMode(value as "watch" | "try"); setStep(0); setMenuOpen(false); }} />
			</RN.View>
			{frame}
			<Text style={{ color: "#949ba4", fontSize: 12, lineHeight: 17, paddingHorizontal: 12 }}>{caption}</Text>
			{enabled && mode === "watch" ? (
				<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}>
					<Press accessibilityRole="button" accessibilityLabel={playing ? "Pause preview" : "Play preview"} onPress={() => setPlaying((value) => !value)}>
						<Icon name={playing ? "PauseIcon" : "PlayIcon"} fallback={playing ? "Ⅱ" : "▶"} />
					</Press>
					<RN.View style={{ flex: 1, height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: "#4e505899" }}>
						<RN.View style={{ width: `${((watchedStep + 1) / (manual ? 4 : 3)) * 100}%`, height: 4, backgroundColor: "#5865f2" }} />
					</RN.View>
					<Text style={{ minWidth: 40, color: "#949ba4", fontSize: 12 }}>{watchedStep + 1}/{manual ? 4 : 3}</Text>
					<Press accessibilityRole="button" accessibilityLabel="Restart preview" onPress={() => { setStep(0); setPlaying(true); }}><Icon name="RetryIcon" fallback="↻" /></Press>
				</RN.View>
			) : enabled ? <Text style={{ color: "#949ba4", fontSize: 12, paddingHorizontal: 12 }}>{manual ? "Hold the message, then choose Translate." : "Hold the message to translate it or show the original."}</Text> : null}
		</RN.View>
	);
}

function ChoiceRow({ selected, label, description, onPress }: { selected: boolean; label: string; description: string; onPress: () => void }) {
	return (
		<TableRow
			label={label}
			subLabel={description}
			accessibilityRole="radio"
			accessibilityState={{ selected }}
			trailing={<Text style={{ color: selected ? "#5865f2" : "#949ba4", fontSize: 18 }}>{selected ? "●" : "○"}</Text>}
			onPress={onPress}
		/>
	);
}

export default function TranslateMessagesSettings() {
	useProxy(storage);
	const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
	const status = useTranslationStatus();
	const enabled = storage.translateMessagesEnabled === true;
	const mode = storage.translateMessagesMode === "manual" ? "manual" : "auto";
	const target = storage.translateMessagesTarget === "phone" ? "phone" : "discord";
	const showLanguage = storage.translateMessagesShowLanguage !== false;
	const showOriginal = storage.translateMessagesShowOriginal === true;
	const update = (next: Record<string, unknown>) => {
		for (const [key, value] of Object.entries(next)) storage[key] = value;
		updateTranslationSettings({
			enabled: storage.enabled !== false && storage.translateMessagesEnabled === true,
			mode: storage.translateMessagesMode === "manual" ? "manual" : "auto",
			target: storage.translateMessagesTarget === "phone" ? "phone" : "discord",
			showLanguage: storage.translateMessagesShowLanguage !== false,
			showOriginal: storage.translateMessagesShowOriginal === true,
		});
		forceUpdate();
	};
	const choose = (key: string, value: string) => update({ [key]: value });
	const clear = () => RN.Alert.alert(
		"Clear saved translations?",
		"Saved results and per-message choices will be removed from this phone. Visible messages will be translated again.",
		[
			{ text: "Cancel", style: "cancel" },
			{ text: "Clear", style: "destructive", onPress: () => { clearTranslations(); showToast("Saved translations cleared.", getAssetIDByName("Check")); } },
		],
	);

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
			<Stack spacing={8}>
				<TableRowGroup title="Translate Messages">
					<TableSwitchRow
						label="Enable translation"
						subLabel="Translate messages in your language, with a hold-menu option for individual messages."
						value={enabled}
						onValueChange={(value: boolean) => update({ translateMessagesEnabled: value })}
					/>
				</TableRowGroup>
				{enabled ? (
					<RN.View style={{ padding: 12, borderRadius: 8, backgroundColor: "#2b2d31" }}>
						<Text style={{ color: "#f2f3f5", fontWeight: "600" }}>
							{status.error || (status.translated ? `Translated ${status.translated} messages this session.` : "Nothing translated yet this session.")}
							{status.waiting ? ` ${status.waiting} waiting.` : ""}
						</Text>
					</RN.View>
				) : null}
				<TableRowGroup title="Preview">
					<RN.View style={{ padding: 8 }}><TranslationPreview enabled={enabled} /></RN.View>
				</TableRowGroup>
				<TableRowGroup title="When to translate">
					<ChoiceRow selected={mode === "auto"} label="Automatically" description="Translate messages on screen that are in another language." onPress={() => choose("translateMessagesMode", "auto")} />
					<ChoiceRow selected={mode === "manual"} label="Only when you ask" description="Hold a message and choose Translate. No other messages are sent." onPress={() => choose("translateMessagesMode", "manual")} />
				</TableRowGroup>
				<TableRowGroup title="Translate into">
					<ChoiceRow selected={target === "discord"} label="Discord's language" description="Uses the language selected in Discord settings." onPress={() => choose("translateMessagesTarget", "discord")} />
					<ChoiceRow selected={target === "phone"} label="Your phone's language" description="Uses the system language when available." onPress={() => choose("translateMessagesTarget", "phone")} />
				</TableRowGroup>
				<TableRowGroup title="Display">
					<TableSwitchRow label="Show the original language" subLabel="Add a small language note below translated text." value={showLanguage} onValueChange={(value: boolean) => update({ translateMessagesShowLanguage: value })} />
					<TableSwitchRow label="Show the original text" subLabel="Add the untranslated message below the translation." value={showOriginal} onValueChange={(value: boolean) => update({ translateMessagesShowOriginal: value })} />
				</TableRowGroup>
				<TableRowGroup title="Manage">
					<TableRow label="Clear saved translations" subLabel={`${status.cacheSize} stored result${status.cacheSize === 1 ? "" : "s"} on this phone.`} trailing={<TableRow.Arrow />} disabled={!status.cacheSize} onPress={clear} />
				</TableRowGroup>
				<RN.View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
					<Text style={{ color: "#949ba4", fontSize: 12, lineHeight: 17 }}>
						Message text is sent to Google Translate only when translation is enabled. Mentions, link destinations, code, and emoji are protected and never sent. Requests omit Discord credentials.
					</Text>
				</RN.View>
			</Stack>
		</ScrollView>
	);
}