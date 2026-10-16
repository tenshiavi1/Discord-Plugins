import { storage } from "@vendetta/plugin";
import { withoutActivityFailures } from "./activityConsole";

export type ManagerActivityStatus = "success" | "failure" | "info";

export type ManagerActivityRecord = {
	timestamp: number;
	status: ManagerActivityStatus;
	summary: string;
	details?: string;
	metrics?: ManagerActivityMetrics;
};

export type ManagerActivityMetrics = {
	installedPlugins: number;
	repositoryPlugins: number;
	updatedPlugins: number;
	updateTotal: number;
};

export const MANAGER_ACTIVITY_KEY = "managerActivity";
const MANAGER_ACTIVITY_LIMIT = 50;
const MANAGER_ACTIVITY_DETAIL_LIMIT = 8000;

function isManagerActivityRecord(record: unknown): record is ManagerActivityRecord {
	if (typeof record !== "object" || record === null) return false;
	if (
		!("timestamp" in record) ||
		typeof record.timestamp !== "number" ||
		!Number.isFinite(record.timestamp) ||
		Math.abs(record.timestamp) > 8.64e15
	) return false;
	if (!("status" in record) || !["success", "failure", "info"].includes(String(record.status))) return false;
	if (!("summary" in record) || typeof record.summary !== "string") return false;
	if ("details" in record && typeof record.details !== "string") return false;
	if (!("metrics" in record) || record.metrics === undefined) return true;
	if (typeof record.metrics !== "object" || record.metrics === null) return false;
	const metrics = record.metrics as Record<string, unknown>;
	return ["installedPlugins", "repositoryPlugins", "updatedPlugins", "updateTotal"].every((key) =>
		typeof metrics[key] === "number" && Number.isFinite(metrics[key]) && metrics[key] >= 0,
	);
}

export function getManagerActivity(): ManagerActivityRecord[] {
	const records: unknown = storage[MANAGER_ACTIVITY_KEY];
	return Array.isArray(records)
		? records.filter(isManagerActivityRecord).slice(0, MANAGER_ACTIVITY_LIMIT)
		: [];
}

export function clearManagerActivityFailures(): ManagerActivityRecord[] {
	const records = getManagerActivity();
	const next = withoutActivityFailures(records);
	if (next.length !== records.length) storage[MANAGER_ACTIVITY_KEY] = next;
	return next;
}

export function recordManagerActivity(
	summary: string,
	status: ManagerActivityStatus,
	details?: string,
	metrics?: ManagerActivityMetrics,
): ManagerActivityRecord[] {
	const record: ManagerActivityRecord = {
		timestamp: Date.now(),
		status,
		summary,
		details: details?.slice(0, MANAGER_ACTIVITY_DETAIL_LIMIT),
		metrics,
	};
	const next = [record, ...getManagerActivity()].slice(0, MANAGER_ACTIVITY_LIMIT);
	storage[MANAGER_ACTIVITY_KEY] = next;
	return next;
}