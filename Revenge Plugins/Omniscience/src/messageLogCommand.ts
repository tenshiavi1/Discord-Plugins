import { registerCommand } from "@vendetta/commands";
import { ReactNative as RN } from "@vendetta/metro/common";
import { showToast } from "../../shared/toast";
import { getRecentMessageLogs } from "./messageHistory";

function formatMessageLogs() {
	return getRecentMessageLogs().map((log) => {
		const time = new Date(log.timestamp).toLocaleTimeString();
		const title = `[${time}] ${log.type.toUpperCase()} by ${log.author} in ${log.channelId}`;
		if (log.type === "edited") {
			return `${title}\nBefore: ${log.previousContent || "(empty)"}\nAfter: ${log.content || "(empty)"}`;
		}
		return `${title}\n${log.content || "(empty message)"}`;
	}).join("\n\n");
}

export function registerMessageLogCommand() {
	try {
		return registerCommand({
			name: "log message",
			displayName: "Message Log",
			description: "Show edits and deletions from the last five minutes.",
			options: [],
			execute: () => {
				const logs = formatMessageLogs();
				if (!logs) {
					showToast("No edited or deleted messages in the last five minutes.");
					return;
				}
				if (typeof RN.Alert?.alert !== "function") {
					showToast("The private message-log view is unavailable on this client.");
					return;
				}
				RN.Alert.alert("Recent message log · 5 minutes", logs, [{ text: "Close" }]);
			},
		});
	} catch (error) {
		console.error("[Omniscience] Could not register /log message.", error);
		return undefined;
	}
}