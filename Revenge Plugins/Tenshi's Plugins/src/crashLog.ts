import { storage } from "@vendetta/plugin";
import { MANAGED_PLUGINS } from "./catalog";

export type CrashRecord = {
	pluginName: string;
	timestamp: number;
	logs: string;
};

const LAST_CRASH_KEY = "lastCrash";

function identifyPlugin(message: string, stack: string) {
	const errorText = `${message}\n${stack}`;
	for (const plugin of MANAGED_PLUGINS) {
		if (errorText.toLocaleLowerCase().includes(plugin.name.toLocaleLowerCase())) {
			return plugin.name;
		}
	}

	const pluginPath = stack.match(/Revenge(?:%20|\s)Plugins[\\/](.+?)(?:[\\/?:]|$)/i)?.[1];
	if (pluginPath) {
		try {
			return decodeURIComponent(pluginPath.replace(/\+/g, " "));
		} catch {
			return pluginPath;
		}
	}
	return "Unknown plugin";
}

function errorDetails(error: unknown) {
	if (error instanceof Error) {
		return {
			message: error.message || error.name,
			stack: error.stack || "",
		};
	}
	return { message: String(error), stack: "" };
}

export function getLastCrash(): CrashRecord | undefined {
	const record: unknown = storage[LAST_CRASH_KEY];
	if (
		typeof record === "object" &&
		record !== null &&
		"pluginName" in record &&
		typeof record.pluginName === "string" &&
		"timestamp" in record &&
		typeof record.timestamp === "number" &&
		Number.isFinite(record.timestamp) &&
		"logs" in record &&
		typeof record.logs === "string"
	) {
		return {
			pluginName: record.pluginName,
			timestamp: record.timestamp,
			logs: record.logs,
		};
	}
	if (record !== undefined) {
		console.error("[Tenshi's Plugins] Ignoring invalid saved crash log data.");
	}
	return undefined;
}

export function clearLastCrash() {
	storage[LAST_CRASH_KEY] = undefined;
}

function saveCrash(error: unknown, isFatal: boolean) {
	const { message, stack } = errorDetails(error);
	const timestamp = Date.now();
	const logs = [
		`Unhandled JavaScript error (${isFatal ? "fatal" : "non-fatal"})`,
		`Timestamp: ${new Date(timestamp).toISOString()}`,
		`Message: ${message}`,
		stack ? `Stack:\n${stack}` : "Stack: unavailable",
	].join("\n");

	storage[LAST_CRASH_KEY] = {
		pluginName: identifyPlugin(message, stack),
		timestamp,
		logs,
	} satisfies CrashRecord;
}

type GlobalErrorUtils = {
	getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
	setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

export function installCrashCapture() {
	const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
	if (!errorUtils) {
		console.error("[Tenshi's Plugins] React Native's global error handler is unavailable; crash logging is disabled.");
		return () => {};
	}

	const previousHandler = errorUtils.getGlobalHandler();
	const handler = (error: unknown, isFatal = false) => {
		try {
			saveCrash(error, isFatal);
		} catch (captureError) {
			console.error("[Tenshi's Plugins] Could not save the last crash log.", captureError);
		}
		previousHandler(error, isFatal);
	};

	errorUtils.setGlobalHandler(handler);
	return () => {
		if (errorUtils.getGlobalHandler() === handler) {
			errorUtils.setGlobalHandler(previousHandler);
		}
	};
}
