import { React, ReactNative as RN } from "@vendetta/metro/common";

type StableTextInputProps = {
	value: string;
	onChangeText: (value: string) => void;
	placeholder?: string;
	accessibilityLabel?: string;
	keyboardType?: "default" | "numeric";
	maxLength?: number;
	editable?: boolean;
	resetKey?: string | number;
	returnKeyType?: "done" | "next" | "search" | "send";
	onSubmitEditing?: () => void;
	style?: Record<string, unknown>;
};

function stylesEqual(
	first?: Record<string, unknown>,
	second?: Record<string, unknown>,
): boolean {
	if (first === second) return true;
	if (!first || !second) return false;
	const firstKeys = Object.keys(first);
	const secondKeys = Object.keys(second);
	return firstKeys.length === secondKeys.length
		&& firstKeys.every((key) => first[key] === second[key]);
}

// Keep storage-driven parent renders from re-syncing text and moving the native cursor.
const StableTextInput = React.memo(function StableTextInput({
	value,
	onChangeText,
	placeholder,
	accessibilityLabel,
	keyboardType = "default",
	maxLength,
	editable = true,
	resetKey,
	returnKeyType,
	onSubmitEditing,
	style,
}: StableTextInputProps) {
	return (
		<RN.TextInput
			key={resetKey}
			defaultValue={value}
			placeholder={placeholder}
			placeholderTextColor="#949ba4"
			accessibilityLabel={accessibilityLabel}
			keyboardType={keyboardType}
			maxLength={maxLength}
			autoCapitalize="none"
			autoCorrect={false}
			spellCheck={false}
			editable={editable}
			contextMenuHidden={false}
			underlineColorAndroid="transparent"
			returnKeyType={returnKeyType}
			onSubmitEditing={onSubmitEditing}
			onChangeText={onChangeText}
			style={style}
		/>
	);
}, (previous, next) => previous.placeholder === next.placeholder
	&& previous.accessibilityLabel === next.accessibilityLabel
	&& previous.keyboardType === next.keyboardType
	&& previous.maxLength === next.maxLength
	&& previous.editable === next.editable
	&& previous.resetKey === next.resetKey
	&& previous.returnKeyType === next.returnKeyType
	&& previous.onSubmitEditing === next.onSubmitEditing
	&& stylesEqual(previous.style, next.style));

export default StableTextInput;
