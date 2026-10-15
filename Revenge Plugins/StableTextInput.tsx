import { React, ReactNative as RN } from "@vendetta/metro/common";

type StableTextInputProps = {
	value: string;
	onChangeText: (value: string) => void;
	placeholder?: string;
	keyboardType?: "default" | "numeric";
	maxLength?: number;
	editable?: boolean;
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
	keyboardType = "default",
	maxLength,
	editable = true,
	returnKeyType,
	onSubmitEditing,
	style,
}: StableTextInputProps) {
	return (
		<RN.TextInput
			defaultValue={value}
			placeholder={placeholder}
			placeholderTextColor="#949ba4"
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
	&& previous.keyboardType === next.keyboardType
	&& previous.maxLength === next.maxLength
	&& previous.editable === next.editable
	&& previous.returnKeyType === next.returnKeyType
	&& previous.onSubmitEditing === next.onSubmitEditing
	&& stylesEqual(previous.style, next.style));

export default StableTextInput;
