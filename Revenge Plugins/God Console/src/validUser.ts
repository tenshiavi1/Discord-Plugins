import { React } from "@vendetta/metro/common";
import { before, after } from "@vendetta/patcher";
import { findByProps, findByStoreName } from "../../compat";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "../../shared/toast";

const actionSheet = findByProps("openLazy", "hideActionSheet");
const actionSheetRow = findByProps("ActionSheetRow")?.ActionSheetRow;
const mentionPattern = /<@!?([0-9]{17,20})>/g;
const inFlightUsers = new Map<string, Promise<boolean>>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;
let enabled = false;
let unpatch: (() => void) | undefined;

function extractMentionIds(message: any): string[] {
	const texts: string[] = [];
	const collectMessageText = (candidate: any) => {
		if (typeof candidate?.content === "string") texts.push(candidate.content);
		for (const embed of Array.isArray(candidate?.embeds) ? candidate.embeds : []) {
			for (const value of [embed?.rawTitle, embed?.rawDescription, embed?.title, embed?.description]) {
				if (typeof value === "string") texts.push(value);
			}
			for (const field of Array.isArray(embed?.fields) ? embed.fields : []) {
				for (const value of [field?.rawName, field?.rawValue, field?.name, field?.value]) {
					if (typeof value === "string") texts.push(value);
				}
			}
		}
		const pendingComponents = Array.isArray(candidate?.components) ? [...candidate.components] : [];
		let inspectedComponents = 0;
		while (pendingComponents.length > 0 && inspectedComponents < 1000) {
			const component = pendingComponents.pop();
			inspectedComponents++;
			if (typeof component?.content === "string") texts.push(component.content);
			if (Array.isArray(component?.components)) pendingComponents.push(...component.components);
		}
	};
	collectMessageText(message);
	for (const snapshot of Array.isArray(message?.messageSnapshots) ? message.messageSnapshots : []) {
		if (snapshot?.message) collectMessageText(snapshot.message);
	}
	const ids = new Set<string>();
	for (const text of texts) {
		for (const match of text.matchAll(mentionPattern)) ids.add(match[1]);
	}
	return [...ids];
}

function isCached(userId: string): boolean {
	return Boolean(findByStoreName("UserStore")?.getUser?.(userId));
}

async function fetchAndDispatchUser(userId: string): Promise<boolean> {
	if (isCached(userId)) return true;
	const userUtils = findByProps("fetchUser");
	if (typeof userUtils?.fetchUser === "function") {
		try {
			await userUtils.fetchUser(userId);
			if (isCached(userId)) return true;
		} catch (error) {
			console.warn(`[God Console] Client user lookup failed for ${userId}.`, error);
		}
	}

	const restApi = findByProps("get", "post", "del", "patch") ?? findByProps("get");
	const dispatcher = findByProps("dispatch", "subscribe") ?? findByStoreName("Dispatcher");
	if (typeof restApi?.get !== "function" || typeof dispatcher?.dispatch !== "function") return false;
	try {
		const response = await restApi.get({ url: `/users/${userId}` });
		const user = response?.body;
		if (response?.status !== 200 || typeof user?.id !== "string" || user.id !== userId) return false;
		dispatcher.dispatch({ type: "USER_UPDATE", user });
		return true;
	} catch (error) {
		console.warn(`[God Console] Could not resolve mentioned user ${userId}.`, error);
		return false;
	}
}

function resolveUser(userId: string): Promise<boolean> {
	if (isCached(userId)) return Promise.resolve(true);
	const pending = inFlightUsers.get(userId);
	if (pending) return pending;

	const request = requestQueue.then(async () => {
		if (isCached(userId)) return true;
		const wait = Math.max(0, 300 - (Date.now() - lastRequestAt));
		if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
		lastRequestAt = Date.now();
		return fetchAndDispatchUser(userId);
	});
	requestQueue = request.then(() => undefined, () => undefined);
	inFlightUsers.set(userId, request);
	void request.finally(() => inFlightUsers.delete(userId));
	return request;
}

function forceMessageRefresh(message: any, channelId: string) {
	const dispatcher = findByProps("dispatch", "subscribe") ?? findByStoreName("Dispatcher");
	if (typeof dispatcher?.dispatch !== "function" || typeof message?.id !== "string") return;
	const content = typeof message.content === "string" ? message.content : "";
	const update = (nextContent: string) => dispatcher.dispatch({
		type: "MESSAGE_UPDATE",
		channelId,
		message: { id: message.id, channel_id: channelId, content: nextContent },
	});
	update(`${content}\u200b `);
	setTimeout(() => update(content), 120);
}

async function repairMessageMentions(message: any) {
	const channelId = message?.channel_id ?? message?.channelId;
	if (typeof channelId !== "string") return;
	const missing = extractMentionIds(message).filter((id) => !isCached(id));
	if (missing.length === 0) {
		showToast("This message has no unresolved user mentions.");
		return;
	}

	const targetIds = missing.slice(0, 10);
	let resolved = 0;
	for (const userId of targetIds) {
		if (await resolveUser(userId)) resolved++;
	}
	if (resolved > 0) forceMessageRefresh(message, channelId);
	const skipped = missing.length - targetIds.length;
	showToast(
		`${resolved} of ${missing.length} mention${missing.length === 1 ? "" : "s"} resolved${skipped > 0 ? `; ${skipped} skipped` : ""}.`,
		getAssetIDByName(resolved > 0 ? "Check" : "Warning"),
	);
}

function getActionRows(tree: any): any[] | undefined {
	const groups = findInReactTree(tree, (node: any) =>
		Array.isArray(node) && node[0]?.type?.name === "ActionSheetRowGroup",
	) as any[] | undefined;
	if (!groups) return undefined;
	return findInReactTree(groups, (node: any) =>
		Array.isArray(node) && node.some((child: any) => child?.type?.name === "ActionSheetRow"),
	) as any[] | undefined;
}

function installAction() {
	if (!actionSheet?.openLazy || !actionSheetRow) return;
	unpatch = before("openLazy", actionSheet, ([component, actionName, sheetProps]: any[]) => {
		if (!enabled || actionName !== "MessageLongPressActionSheet" || !sheetProps?.message) return;
		const message = sheetProps.message;
		if (extractMentionIds(message).every((id) => isCached(id))) return;
		if (!component || typeof component.then !== "function") return;

		void component.then((module: any) => {
			if (!enabled || !module?.default) return;
			const cleanup = after("default", module, (_args: any[], rendered: any) => {
				React.useEffect(() => () => {
					cleanup();
					const index = unpatches.indexOf(cleanup);
					if (index >= 0) unpatches.splice(index, 1);
				}, []);
				if (!enabled) return rendered;
				const rows = getActionRows(rendered);
				if (!rows || rows.some((row) => row?.props?.godConsoleMentionRepair)) return rendered;
				const missingCount = extractMentionIds(message).filter((id) => !isCached(id)).length;
				if (missingCount === 0) return rendered;
				const mentionIcon = getAssetIDByName("ic_mention_24px") ?? getAssetIDByName("MentionIcon");
				rows.unshift(React.createElement(actionSheetRow, {
					key: `god-console-repair-${message.id}`,
					label: `Fix ${missingCount} unresolved mention${missingCount === 1 ? "" : "s"}`,
					godConsoleMentionRepair: true,
					icon: actionSheetRow.Icon && mentionIcon
						? React.createElement(actionSheetRow.Icon, { source: mentionIcon })
						: undefined,
					onPress: () => {
						actionSheet.hideActionSheet();
						void repairMessageMentions(message);
					},
				}));
				return rendered;
			});
			unpatches.push(cleanup);
		}).catch((error: unknown) => {
			console.error("[God Console] Could not open mention repair actions.", error);
		});
	});
}

const unpatches: (() => void)[] = [];

export function setValidUserEnabled(value: boolean) {
	if (enabled === value) return;
	enabled = value;
	if (enabled) {
		installAction();
		if (unpatch) unpatches.push(unpatch);
		unpatch = undefined;
		return;
	}
	if (unpatch) {
		unpatch();
		unpatch = undefined;
	}
	for (const cleanup of unpatches.splice(0).reverse()) {
		try {
			cleanup();
		} catch (error) {
			console.warn("[God Console] Could not remove a mention repair patch.", error);
		}
	}
}