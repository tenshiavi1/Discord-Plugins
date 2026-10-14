import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { METHODS } from "./filenames";

const { FormRow, FormSection, FormSwitchRow } = Forms;

function TextSetting({ label, storageKey, placeholder, keyboardType = "default" }: {
	label: string;
	storageKey: string;
	placeholder: string;
	keyboardType?: "default" | "numeric";
}) {
	return (
		<RN.View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
			<RN.Text style={{ color: "#f2f3f5", fontSize: 14, marginBottom: 6 }}>{label}</RN.Text>
			<RN.TextInput
				value={String(storage[storageKey] ?? "")}
				placeholder={placeholder}
				placeholderTextColor="#949ba4"
				keyboardType={keyboardType}
				autoCapitalize="none"
				onChangeText={(value: string) => {
					storage[storageKey] = keyboardType === "numeric" ? Number(value) || 0 : value;
				}}
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

export default function Settings() {
	useProxy(storage);

	return (
		<RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
			<FormSection title="Privacy" titleStyleType="no_border">
				<FormSwitchRow
					label="Anonymize uploaded file names"
					subLabel="Replace attachment names before the client uploads them."
					value={Boolean(storage.anonymiseByDefault)}
					onValueChange={(value: boolean) => { storage.anonymiseByDefault = value; }}
				/>
				<FormSwitchRow
					label="Remove tracking parameters from sent URLs"
					subLabel="Clean common advertising and click-tracking parameters when sending or editing messages."
					value={Boolean(storage.clearTrackingUrls)}
					onValueChange={(value: boolean) => { storage.clearTrackingUrls = value; }}
				/>
			</FormSection>
			<FormSection title="Anonymization method" titleStyleType="no_border">
				{METHODS.map((method) => (
					<FormRow
						key={method.value}
						label={`${storage.method === method.value ? "(Selected) " : ""}${method.label}`}
						onPress={() => { storage.method = method.value; }}
					/>
				))}
				{storage.method === "random" && (
					<TextSetting
						label="Random name length (1-64)"
						storageKey="randomizedLength"
						placeholder="7"
						keyboardType="numeric"
					/>
				)}
				{storage.method === "consistent" && (
					<TextSetting
						label="Replacement name"
						storageKey="consistentName"
						placeholder="file"
					/>
				)}
			</FormSection>
			<RN.Text style={{ color: "#b5bac1", paddingHorizontal: 16, paddingTop: 8 }}>
				File extensions are preserved. This changes names only; it does not remove metadata from file contents.
			</RN.Text>
		</RN.ScrollView>
	);
}
