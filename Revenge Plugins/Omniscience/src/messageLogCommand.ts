import { registerCommand } from "@vendetta/commands";
import { ReactNative as RN } from "@vendetta/metro/common";
import { showToast } from "../../shared/toast";
import { getRecentMessageLogs } from "./messageHistory";

function formatMessageLogs() {
	return getRecentMessageLogs().map((log) => {
		const time = new Date(log.timestamp).toLocaleTimeString();
		const operation = log.operation.toUpperCase();
		const detail = log.messageId
			? `${log.detail} (channel ${log.channelId ?? "?"}, message ${log.messageId})`
			: log.detail;
		return `[${time}] ${operation} ${log.stage}: ${log.result}\n${detail}`;
	}).join("\n\n");
}

export function registerMessageLogCommand() {
	try {
		return registerCommand({
			name: "message log",
			displayName: "Message Handling Log",
			description: "Show edit and delete handling steps from the last five minutes.",
			options: [],
			execute: () => {
				const logs = formatMessageLogs();
				if (!logs) {
					showToast("No edit/delete handling events in the last five minutes.");
					return;
				}
				if (typeof RN.Alert?.alert !== "function") {
					showToast("The private message-log view is unavailable on this client.");
					return;
				}
				RN.Alert.alert("Edit/delete process trace · 5 minutes", logs, [{ text: "Close" }]);
			},
		});
	} catch (error) {
		console.error("[Omniscience] Could not register /log message.", error);
		return undefined;
	}
}