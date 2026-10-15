import { storage } from "@vendetta/plugin";
import { recordManagerActivity } from "./activityLog";
import { addPendingRestart, isPendingRestartFromPreviousSession, type PendingManagerRestart } from "./restartStateCore";

const RUNTIME_SESSION_KEY = "__tenshiPluginsRuntimeSessionV1";
const PENDING_RESTART_KEY = "pendingManagerRestart";

function getRuntimeSessionId() {
	const global = globalThis as typeof globalThis & { [RUNTIME_SESSION_KEY]?: string };
	if (!global[RUNTIME_SESSION_KEY]) {
		global[RUNTIME_SESSION_KEY] = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	}
	return global[RUNTIME_SESSION_KEY]!;
}

export function getPendingManagerRestart(): PendingManagerRestart | undefined {
	const pending: unknown = storage[PENDING_RESTART_KEY];
	if (
		typeof pending !== "object" ||
		pending === null ||
		!("sessionId" in pending) ||
		typeof pending.sessionId !== "string" ||
		!("updatedAt" in pending) ||
		typeof pending.updatedAt !== "number" ||
		!Number.isFinite(pending.updatedAt) ||
		!("pluginNames" in pending) ||
		!Array.isArray(pending.pluginNames) ||
		!pending.pluginNames.every((name) => typeof name === "string")
	) return undefined;
	return pending as PendingManagerRestart;
}

export function markManagerRestartRequired(pluginName: string) {
	const pending = addPendingRestart(getPendingManagerRestart(), pluginName, getRuntimeSessionId(), Date.now());
	storage[PENDING_RESTART_KEY] = pending;
	return pending.pluginNames;
}

export function settleManagerRestartOnStartup() {
	const pending = getPendingManagerRestart();
	if (!isPendingRestartFromPreviousSession(pending, getRuntimeSessionId())) return;
	storage[PENDING_RESTART_KEY] = undefined;
	recordManagerActivity(
		`Revenge restarted; updates for ${pending.pluginNames.join(", ")} are now loaded.`,
		"success",
	);
}