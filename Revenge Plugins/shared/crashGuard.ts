type PluginStorage = Record<string, any>;

export type CrashFeature = {
	storageKey: string;
	patterns?: RegExp[];
};

export type CrashGuardOptions = {
	features?: CrashFeature[];
	fallbackKeys?: string[];
};

type Registration = {
	pluginName: string;
	storage: PluginStorage;
	features: CrashFeature[];
	fallbackKeys: string[];
};

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

type GlobalErrorUtils = {
	getGlobalHandler?: () => ErrorHandler;
	setGlobalHandler?: (handler: ErrorHandler) => void;
};

type Registry = {
	registrations: Map<string, Registration>;
	recentSignatures: Map<string, number>;
	errorUtils?: GlobalErrorUtils;
	previousHandler?: ErrorHandler;
	handler?: ErrorHandler;
};

const REGISTRY_KEY = "__tenshiPluginCrashGuardV1";
const LAST_CRASH_KEY = "lastCrash";
const LAST_ERROR_KEY = "lastError";
const CRASH_REASONS_KEY = "crashReasons";
const PENDING_DISABLE_KEY = "pendingCrashDisable";
const MAX_LOG_LENGTH = 12_000;
const MAX_CRASH_REASONS = 10;

function getRegistry(): Registry {
	const global = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Registry };
	if (!global[REGISTRY_KEY]) {
		global[REGISTRY_KEY] = { registrations: new Map(), recentSignatures: new Map() };
	}
	global[REGISTRY_KEY]!.recentSignatures ??= new Map();
	return global[REGISTRY_KEY]!;
}

function normalized(value: string) {
	return value.replace(/%20|\+/gi, " ").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function errorDetails(error: unknown) {
	if (error && typeof error === "object") {
		const value = error as { name?: unknown; message?: unknown; stack?: unknown };
		return {
			name: typeof value.name === "string" && value.name ? value.name : "Error",
			message: typeof value.message === "string" && value.message ? value.message : String(error),
			stack: typeof value.stack === "string" ? value.stack : "",
		};
	}
	return { name: "Error", message: String(error), stack: "" };
}

function identifyRegistration(registrations: Registration[], message: string, stack: string) {
	const path = stack.match(/Revenge(?:%20|\s)Plugins[\\/](.+?)(?:[\\/?:]|$)/i)?.[1];
	if (path) {
		let decodedPath = path;
		try {
			decodedPath = decodeURIComponent(path.replace(/\+/g, " "));
		} catch {
			// Keep the encoded path for comparison.
		}
		const pathName = normalized(decodedPath);
		const pathMatch = registrations.find((registration) => pathName === normalized(registration.pluginName));
		if (pathMatch) return pathMatch;
	}

	const text = normalized(`${message}\n${stack}`);
	return registrations.find((registration) => text.includes(normalized(registration.pluginName)));
}

function matchesFeature(feature: CrashFeature, source: string) {
	return feature.patterns?.some((pattern) => {
		pattern.lastIndex = 0;
		return pattern.test(source);
	}) ?? false;
}

function getPendingDisables(storage: PluginStorage, allowedKeys: Set<string>) {
	const pending: unknown = storage[PENDING_DISABLE_KEY];
	if (!Array.isArray(pending)) return [];
	return pending.filter(
		(item): item is { pluginName: string; storageKey: string; timestamp: number } =>
			typeof item === "object" &&
			item !== null &&
			typeof item.pluginName === "string" &&
			typeof item.storageKey === "string" &&
			allowedKeys.has(item.storageKey) &&
			typeof item.timestamp === "number" &&
			Number.isFinite(item.timestamp),
	);
}

function recoverPendingDisables(registration: Registration) {
	const allowedKeys = new Set([
		...registration.features.map((feature) => feature.storageKey),
		...registration.fallbackKeys,
	]);
	if (allowedKeys.size === 0) return;

	let pending: ReturnType<typeof getPendingDisables>;
	try {
		pending = getPendingDisables(registration.storage, allowedKeys);
	} catch (error) {
		console.warn(`[${registration.pluginName}] Could not read pending crash recovery data.`, error);
		return;
	}
	const recovered: typeof pending = [];
	for (const item of pending) {
		if (item.pluginName !== registration.pluginName) continue;
		registration.storage[item.storageKey] = false;
		recovered.push(item);
		console.warn(
			`[${registration.pluginName}] Disabled ${item.storageKey} after a fatal error. Re-enable it in plugin settings after investigating the crash.`,
		);
	}
	if (recovered.length > 0) {
		const recoveredSet = new Set(recovered);
		registration.storage[PENDING_DISABLE_KEY] = pending.filter((item) => !recoveredSet.has(item));
	}
}

function queueDisable(registration: Registration, source: string, timestamp: number) {
	const feature = registration.features.find((candidate) => matchesFeature(candidate, source));
	const keys = feature ? [feature.storageKey] : registration.fallbackKeys;
	if (keys.length === 0) return;

	const allowedKeys = new Set([
		...registration.features.map((candidate) => candidate.storageKey),
		...registration.fallbackKeys,
	]);
	const pending = getPendingDisables(registration.storage, allowedKeys).filter(
		(item) => item.pluginName !== registration.pluginName || !keys.includes(item.storageKey),
	);
	registration.storage[PENDING_DISABLE_KEY] = [
		...pending,
		...keys.map((storageKey) => ({ pluginName: registration.pluginName, storageKey, timestamp })),
	].slice(-MAX_CRASH_REASONS);
}

function recordError(registration: Registration, pluginName: string, error: unknown, isFatal: boolean) {
	const { name, message, stack } = errorDetails(error);
	const timestamp = Date.now();
	const logs = [
		`Unhandled JavaScript error (${isFatal ? "fatal" : "non-fatal"})`,
		`Timestamp: ${new Date(timestamp).toISOString()}`,
		`Plugin: ${pluginName}`,
		`Type: ${name}`,
		`Message: ${message}`,
		stack ? `Stack:\n${stack}` : "Stack: unavailable",
	].join("\n").slice(0, MAX_LOG_LENGTH);
	const record = {
		pluginName,
		timestamp,
		logs,
		fatal: isFatal,
		errorName: name.slice(0, 80),
		message: message.slice(0, 500),
	};

	registration.storage[isFatal ? LAST_CRASH_KEY : LAST_ERROR_KEY] = record;
	if (isFatal) console.error(`[${registration.pluginName}] Captured fatal crash.`, logs);
	else console.warn(`[${registration.pluginName}] Captured non-fatal error: ${name}: ${message.slice(0, 240)}`);
	if (!isFatal || pluginName === "Unknown plugin") return;

	const reasons: unknown = registration.storage[CRASH_REASONS_KEY];
	registration.storage[CRASH_REASONS_KEY] = [
		...(Array.isArray(reasons) ? reasons : []).filter(
			(reason) =>
				typeof reason === "object" &&
				reason !== null &&
				typeof reason.pluginName === "string" &&
				typeof reason.timestamp === "number",
		),
		{ pluginName, timestamp },
	].slice(-MAX_CRASH_REASONS);
	queueDisable(registration, `${message}\n${stack}`, timestamp);
}

function captureError(registry: Registry, error: unknown, isFatal: boolean) {
	const registrations = [...registry.registrations.values()];
	if (registrations.length === 0) return;

	const details = errorDetails(error);
	const matched = identifyRegistration(registrations, details.message, details.stack);
	const manager = registrations.find((candidate) => candidate.pluginName === "Tenshi's Plugins");
	const registration = matched ?? manager ?? registrations[0];

	const pluginName = matched ? registration.pluginName : "Unknown plugin";
	const destinations = matched && manager && manager !== matched ? [matched, manager] : [registration];
	const destinationNames = destinations.map((destination) => destination.pluginName).sort().join("|");
	const signature = `${destinationNames}:${pluginName}:${isFatal}:${details.name.slice(0, 80)}:${details.message.slice(0, 500)}`;
	const timestamp = Date.now();
	const previousTimestamp = registry.recentSignatures.get(signature);
	if (previousTimestamp !== undefined && timestamp - previousTimestamp < 5_000) return;
	registry.recentSignatures.set(signature, timestamp);
	if (registry.recentSignatures.size > 100) {
		const oldestSignature = registry.recentSignatures.keys().next().value;
		if (oldestSignature !== undefined) registry.recentSignatures.delete(oldestSignature);
	}
	for (const destination of destinations) {
		try {
			recordError(destination, pluginName, error, isFatal);
		} catch (captureError) {
			console.error(`[${destination.pluginName}] Could not save crash diagnostics.`, captureError);
		}
	}
}

function installGlobalHandler(registry: Registry) {
	const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
	if (!errorUtils || typeof errorUtils.getGlobalHandler !== "function" || typeof errorUtils.setGlobalHandler !== "function") {
		console.warn("[Tenshi Plugins] React Native's global error handler is unavailable; crash capture is disabled.");
		return;
	}

	try {
		const currentHandler = errorUtils.getGlobalHandler();
		if (typeof currentHandler !== "function") {
			console.warn("[Tenshi Plugins] React Native's global error handler is invalid; crash capture is disabled.");
			return;
		}
		if (currentHandler === registry.handler) {
			registry.errorUtils = errorUtils;
			return;
		}
		const handler: ErrorHandler = (error, isFatal = false) => {
			try {
				captureError(registry, error, Boolean(isFatal));
			} catch (captureError) {
				console.error("[Tenshi Plugins] Crash capture failed.", captureError);
			}
			currentHandler(error, isFatal);
		};
		errorUtils.setGlobalHandler(handler);
		registry.errorUtils = errorUtils;
		registry.previousHandler = currentHandler;
		registry.handler = handler;
	} catch (error) {
		console.error("[Tenshi Plugins] Could not install the global crash handler.", error);
	}
}

export function installPluginCrashGuard(
	pluginName: string,
	storage: PluginStorage,
	options: CrashGuardOptions = {},
) {
	const registry = getRegistry();
	const registration: Registration = {
		pluginName,
		storage,
		features: options.features ?? [],
		fallbackKeys: options.fallbackKeys ?? [],
	};
	try {
		recoverPendingDisables(registration);
	} catch (error) {
		console.warn(`[${pluginName}] Crash recovery initialization failed.`, error);
	}
	registry.registrations.set(pluginName, registration);
	installGlobalHandler(registry);

	return () => {
		if (registry.registrations.get(pluginName) === registration) {
			registry.registrations.delete(pluginName);
		}
		if (registry.registrations.size !== 0 || !registry.errorUtils || !registry.handler) return;
		try {
			if (registry.errorUtils.getGlobalHandler?.() === registry.handler) {
				registry.errorUtils.setGlobalHandler?.(registry.previousHandler!);
				registry.handler = undefined;
				registry.previousHandler = undefined;
				registry.errorUtils = undefined;
			}
		} catch (error) {
			console.warn(`[${pluginName}] Could not restore React Native's global error handler.`, error);
		}
	};
}