import { findByProps, findByPropsAll, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

type UnknownRecord = Record<string, unknown>;

type DeveloperModeSetting = {
	getSetting: () => unknown;
	updateSetting: (value: boolean) => unknown;
};

type ProtoClass = {
	fields?: unknown;
	create?: (value?: UnknownRecord) => UnknownRecord;
};

type UserSettingsActionCreators = {
	ProtoClass: ProtoClass;
	getCurrentValue?: () => unknown;
};

type Dispatcher = {
	dispatch: (event: unknown) => unknown;
};

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retriesRemaining = 20;
let retryGeneration = 0;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null;
}

function findDeveloperModeSetting(): DeveloperModeSetting | undefined {
	for (const exports of findByPropsAll("DeveloperMode")) {
		if (!isRecord(exports)) continue;
		const setting = exports.DeveloperMode;
		if (
			isRecord(setting) &&
			typeof setting.getSetting === "function" &&
			typeof setting.updateSetting === "function"
		) {
			return setting as DeveloperModeSetting;
		}
	}
	return undefined;
}

function findUserSettingsActionCreators(): UserSettingsActionCreators | undefined {
	for (const exports of findByPropsAll("PreloadedUserSettingsActionCreators")) {
		if (!isRecord(exports)) continue;
		const creators = exports.PreloadedUserSettingsActionCreators;
		if (
			isRecord(creators) &&
			isRecord(creators.ProtoClass) &&
			typeof creators.ProtoClass.create === "function"
		) {
			return creators as unknown as UserSettingsActionCreators;
		}
	}
	return undefined;
}

function getAppearanceMessageType(protoClass: ProtoClass) {
	if (!Array.isArray(protoClass.fields)) return undefined;
	const appearanceField = protoClass.fields.find(
		(field) => isRecord(field) && field.localName === "appearance",
	);
	if (!isRecord(appearanceField)) return undefined;
	const messageTypeFactory = Object.values(appearanceField).find(
		(value): value is () => unknown => typeof value === "function",
	);
	if (!messageTypeFactory) return undefined;
	const messageType = messageTypeFactory();
	if (!isRecord(messageType) || typeof messageType.create !== "function") return undefined;
	return messageType as { create: (value?: UnknownRecord) => UnknownRecord };
}

function getDispatcher(): Dispatcher | undefined {
	const dispatcher = FluxDispatcher ?? findByProps("dispatch", "subscribe");
	if (!isRecord(dispatcher) || typeof dispatcher.dispatch !== "function") return undefined;
	return dispatcher as Dispatcher;
}

function readDeveloperMode() {
	const store = findByStoreName("UserSettingsProtoStore");
	if (!isRecord(store) || !isRecord(store.settings) || !isRecord(store.settings.appearance)) {
		return undefined;
	}
	return store.settings.appearance.developerMode;
}

function enableWithActionCreators(creators: UserSettingsActionCreators): boolean {
	const dispatcher = getDispatcher();
	const protoClass = creators.ProtoClass;
	const createProto = protoClass.create;
	const appearanceType = getAppearanceMessageType(protoClass);
	if (!dispatcher || !createProto || !appearanceType) return false;

	const currentValue = creators.getCurrentValue?.();
	const currentAppearance =
		isRecord(currentValue) && isRecord(currentValue.appearance) ? currentValue.appearance : {};
	const appearance = appearanceType.create({
		...currentAppearance,
		developerMode: true,
	});
	appearance.developerMode = true;
	const proto = createProto.call(protoClass);
	proto.appearance = appearance;

	dispatcher.dispatch({
		type: "USER_SETTINGS_PROTO_UPDATE",
		local: true,
		partial: true,
		settings: { type: 1, proto },
	});
	return readDeveloperMode() === true;
}

function forceDeveloperModeInPayload(payload: unknown) {
	if (!isRecord(payload)) return;
	if (payload.type !== "USER_SETTINGS_PROTO_UPDATE" && payload.type !== "USER_SETTINGS_UPDATE") return;
	const settings = payload.settings;
	if (!isRecord(settings)) return;

	const appearances = [
		isRecord(settings.proto) ? settings.proto.appearance : undefined,
		settings.appearance,
	];
	for (const appearance of appearances) {
		if (isRecord(appearance)) appearance.developerMode = true;
	}
}

async function tryEnableDeveloperMode(): Promise<boolean> {
	const setting = findDeveloperModeSetting();
	if (setting) {
		try {
			if (setting.getSetting() === true) return true;
			await setting.updateSetting(true);
			if (setting.getSetting() === true || readDeveloperMode() === true) return true;
		} catch (error) {
			console.warn("[Tenshi's Plugins] Discord's Developer Mode setting API failed; trying the native settings action.", error);
		}
	}

	const creators = findUserSettingsActionCreators();
	if (creators && enableWithActionCreators(creators)) return true;
	return readDeveloperMode() === true;
}

async function retryEnablingDeveloperMode(generation: number) {
	if (generation !== retryGeneration) return;
	try {
		if (await tryEnableDeveloperMode()) {
			retriesRemaining = 0;
			retryTimer = undefined;
			console.info("[Tenshi's Plugins] Discord Developer Mode is enabled.");
			return;
		}
	} catch (error) {
		console.warn("[Tenshi's Plugins] Could not enable Discord Developer Mode yet; retrying.", error);
	}
	if (generation !== retryGeneration) return;
	if (--retriesRemaining <= 0) {
		retryTimer = undefined;
		console.error("[Tenshi's Plugins] Could not locate Discord's native Developer Mode setting or action.");
		return;
	}
	retryTimer = setTimeout(() => {
		void retryEnablingDeveloperMode(generation);
	}, 1000);
}

export function installDeveloperModeGuard(): () => void {
	const dispatcher = getDispatcher();
	if (!dispatcher) {
		console.error("[Tenshi's Plugins] Discord's settings dispatcher is unavailable; Developer Mode updates cannot be guarded.");
		return () => {};
	}

	try {
		const unpatch = before("dispatch", dispatcher, (args) => {
			try {
				forceDeveloperModeInPayload(args[0]);
			} catch (error) {
				console.error("[Tenshi's Plugins] Could not preserve Developer Mode in a settings update.", error);
			}
		});
		return unpatch;
	} catch (error) {
		console.error("[Tenshi's Plugins] Could not install the Developer Mode guard.", error);
		return () => {};
	}
}

export function enableDeveloperMode(): void {
	if (retryTimer) clearTimeout(retryTimer);
	retryGeneration++;
	retriesRemaining = 20;
	void retryEnablingDeveloperMode(retryGeneration);
}

export function stopDeveloperModeRetries(): void {
	retryGeneration++;
	if (retryTimer) clearTimeout(retryTimer);
	retryTimer = undefined;
	retriesRemaining = 0;
}
