import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { after, instead } from "@vendetta/patcher";
import { find, findByProps, findByStoreName } from "../../compat";
import platformIcons from "./deviceIndicatorIcons";
import { resolveComponentModule } from "./deviceIndicatorDiscovery";

export type DeviceIndicatorOptions = {
	enabled: boolean;
	dmHeader: boolean;
	lists: boolean;
	profiles: boolean;
	hideMobileBadge: boolean;
};

const COLORS: Record<string, string> = {
	online: "#23a55a",
	idle: "#f0b232",
	dnd: "#f23f43",
};
const LABELS: Record<string, string> = {
	desktop: "Desktop",
	mobile: "Mobile",
	web: "Web",
	embedded: "Console",
	vr: "VR",
};
const STATUS_LABELS: Record<string, string> = {
	online: "Online",
	idle: "Idle",
	dnd: "Do Not Disturb",
};
const ModuleRequire = globalThis as typeof globalThis & { __r?: (id: number) => any };
const Dispatcher = findByProps("dispatch", "subscribe", "unsubscribe");
const messageStore = findByProps("getMessage", "getMessages");
let presenceStore: any;
let sessionsStore: any;
let userStore: any = findByProps("getCurrentUser");
let channelStore: any = findByProps("getChannel");
let options: DeviceIndicatorOptions = {
	enabled: false,
	dmHeader: true,
	lists: true,
	profiles: true,
	hideMobileBadge: true,
};
const patched = new Set<string>();
const unpatches: (() => void)[] = [];
const voiceRenderers = new WeakMap<(...args: any[]) => any, (...args: any[]) => any>();
let retryUnsubscribe: (() => void) | undefined;

function moduleExports(id: number) {
	if (typeof ModuleRequire.__r !== "function") return null;
	try {
		return ModuleRequire.__r(id);
	} catch {
		return null;
	}
}

function componentModule(id: number, key: string, names: string[]) {
	const direct = moduleExports(id);
	const directModule = resolveComponentModule(direct, key, names);
	if (directModule) return directModule;
	return find((candidate: any) => resolveComponentModule(candidate, key, names) !== null) ?? null;
}

function getStores() {
	if (!presenceStore) {
		const candidate = moduleExports(4930)?.default;
		presenceStore = typeof candidate?.getClientStatus === "function"
			? candidate
			: findByStoreName("PresenceStore") ?? findByProps("getClientStatus");
	}
	if (!sessionsStore) {
		const candidate = moduleExports(4908)?.default;
		sessionsStore = typeof candidate?.getSessions === "function"
			? candidate
			: findByStoreName("SessionsStore") ?? findByProps("getSessions");
	}
	if (!userStore || typeof userStore.getCurrentUser !== "function") {
		const candidate = moduleExports(1377)?.default;
		userStore = typeof candidate?.getCurrentUser === "function"
			? candidate
			: findByStoreName("UserStore") ?? findByProps("getCurrentUser");
	}
	if (!channelStore || typeof channelStore.getChannel !== "function") {
		const candidate = moduleExports(2051)?.default;
		channelStore = typeof candidate?.getChannel === "function"
			? candidate
			: findByStoreName("ChannelStore") ?? findByProps("getChannel");
	}
}

function currentUserId() {
	getStores();
	return userStore?.getCurrentUser?.()?.id;
}

function clientsFor(userId: string) {
	getStores();
	let clients = presenceStore?.getClientStatus?.(userId) ?? {};
	if (userId === currentUserId() && typeof sessionsStore?.getSessions === "function") {
		clients = {};
		const sessions = sessionsStore.getSessions();
		if (sessions && typeof sessions === "object") {
			for (const session of Object.values(sessions) as any[]) {
				const platform = session?.clientInfo?.client;
				if (typeof platform === "string" && platform !== "unknown" && typeof session?.status === "string") {
					clients[platform] = session.status;
				}
			}
		}
	}
	return clients && typeof clients === "object" ? clients as Record<string, string> : {};
}

function DeviceGlyph({ platform, status }: { platform: string; status: string }) {
	const color = COLORS[status] ?? "#949ba4";
	const uri = platformIcons[platform as keyof typeof platformIcons];
	return uri
		? <RN.Image source={{ uri, width: 16, height: 16 }} style={{ width: 16, height: 16, tintColor: color }} />
		: null;
}

export function DeviceBadges({ userId, clients: sampleClients }: { userId?: string; clients?: Record<string, string> }) {
	const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
	getStores();
	React.useEffect(() => {
		const stores = [presenceStore, sessionsStore].filter(Boolean);
		const notify = () => forceUpdate();
		for (const store of stores) store.addChangeListener?.(notify);
		return () => { for (const store of stores) store.removeChangeListener?.(notify); };
	}, [userId, presenceStore, sessionsStore]);
	if (!userId && !sampleClients) return null;
	const clients = sampleClients ?? clientsFor(userId!);
	const devices = Object.keys(clients).filter((platform) => COLORS[clients[platform]] && LABELS[platform]);
	if (!devices.length) return null;
	return (
		<RN.View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
			{devices.map((platform) => (
				<RN.View key={platform} accessibilityRole="image" accessibilityLabel={`${LABELS[platform]}: ${STATUS_LABELS[clients[platform]] ?? clients[platform]}`}>
					<DeviceGlyph platform={platform} status={clients[platform]} />
				</RN.View>
			))}
		</RN.View>
	);
}

function userIdFrom(props: any) {
	const channel = props?.channel ?? (props?.channelId ? channelStore?.getChannel?.(props.channelId) : null);
	return props?.user?.id ?? props?.userId ?? (channel?.type === 1 && channel?.recipients?.length === 1 ? channel.recipients[0] : undefined);
}

function placeBadge(tree: any, props: any, placement: "dmHeader" | "lists" | "profiles") {
	if (!options.enabled || !options[placement] || !React || !tree) return tree;
	const userId = userIdFrom(props);
	let added = false;
	function visit(node: any, depth: number): any {
		if (!node || depth > 18 || typeof node !== "object" || !node.props) return node;
		const nodeProps = node.props;
		const id = userId ?? userIdFrom(nodeProps);
		if (!added && id && node.type !== RN.Text && nodeProps.label != null && typeof nodeProps.label !== "string" && typeof nodeProps.label !== "number") {
			added = true;
			const label = nodeProps.label;
			return React.cloneElement(node, {
				label: React.createElement(RN.View, { style: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 } }, label, React.createElement(DeviceBadges, { userId: id })),
			});
		}
		const children = nodeProps.children;
		if (Array.isArray(children)) {
			const title = children.find((child: any) => child?.props && (
				child.type === RN.Text && typeof child.props.children === "string" ||
				typeof child.props.variant === "string" && /(?:channel-title|heading|semibold)/.test(child.props.variant) ||
				typeof child.props.userName === "string" && "userId" in child.props
			));
			if (!added && id && title && node.type !== RN.Text) {
				added = true;
				const next = children.map((child: any) => child === title
					? React.createElement(RN.View, { key: "omniscience-device-title", style: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 } }, child, React.createElement(DeviceBadges, { userId: id }))
					: visit(child, depth + 1));
				return React.cloneElement(node, { children: next });
			}
			const next = children.map((child: any) => visit(child, depth + 1));
			return next.some((child: any, index: number) => child !== children[index]) ? React.cloneElement(node, { children: next }) : node;
		}
		const child = visit(children, depth + 1);
		return child !== children ? React.cloneElement(node, { children: child }) : node;
	}
	return visit(tree, 0);
}

function patchComponent(moduleId: number, key: string, placement: "dmHeader" | "lists" | "profiles", names: string[] = []) {
	const module = componentModule(moduleId, key, names);
	if (!module || typeof module[key] !== "function") return false;
	const patchKey = `${moduleId}:${key}`;
	if (patched.has(patchKey)) return true;
	patched.add(patchKey);
	unpatches.push(after(key, module, (args: any[], result: any) => {
		const props = args[0] ?? {};
		if (placement === "profiles") {
			const userId = userIdFrom(props);
			if (!options.enabled || !options.profiles || !userId || !result) return result;
			return React.createElement(
				RN.View,
				{ style: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" } },
				result,
				React.createElement(DeviceBadges, { userId }),
			);
		}
		return placeBadge(result, props, placement);
	}));
	return true;
}

function patchAvatar(moduleId: number, key: string, names: string[] = []) {
	const module = componentModule(moduleId, key, names);
	if (!module || typeof module[key] !== "function") return false;
	const patchKey = `${moduleId}:${key}`;
	if (patched.has(patchKey)) return true;
	patched.add(patchKey);
	unpatches.push(instead(key, module, (args: any[], original: (...args: any[]) => any) => {
		const props = args[0];
		if (!options.enabled || !options.hideMobileBadge || !props?.isMobileOnline) return original(...args);
		const next = Array.from(args);
		next[0] = { ...props, isMobileOnline: false };
		return original(...next);
	}));
	return true;
}

function patchVoiceMemberRows() {
	const module = componentModule(12849, "default", ["UserProfileActivityVoiceChannelUsers"]);
	if (!module || typeof module.default !== "function" || patched.has("12849:voiceRows")) return false;
	patched.add("12849:voiceRows");
	unpatches.push(after("default", module, (args: any[], result: any) => {
		if (!options.enabled || !options.lists || !result) return result;
		function visit(node: any, depth: number): any {
			if (!node || depth > 18 || typeof node !== "object" || !node.props) return node;
			const props = node.props;
			if (typeof props.renderItem === "function" && !props.__omniscienceDeviceIndicators) {
				const originalRender = props.renderItem;
				let renderItem = voiceRenderers.get(originalRender);
				if (!renderItem) {
					renderItem = function (this: unknown, ...renderArgs: any[]) {
						const row = originalRender.apply(this, renderArgs);
						return placeBadge(row, renderArgs[0] ?? {}, "lists");
					};
					voiceRenderers.set(originalRender, renderItem);
				}
				return React.cloneElement(node, { ...props, renderItem, __omniscienceDeviceIndicators: true });
			}
			const children = props.children;
			if (Array.isArray(children)) {
				const next = children.map((child: any) => visit(child, depth + 1));
				return next.some((child: any, index: number) => child !== children[index]) ? React.cloneElement(node, { children: next }) : node;
			}
			const child = visit(children, depth + 1);
			return child !== children ? React.cloneElement(node, { children: child }) : node;
		}
		return visit(result, 0);
	}));
	return true;
}

function installPatches() {
	let found = false;
	found = patchComponent(13107, "default", "dmHeader", ["PrivateChannelHeader"]) || found;
	found = patchComponent(15962, "default", "lists", ["MessagesItemChannelContent"]) || found;
	found = patchComponent(10602, "default", "lists", ["UserRow"]) || found;
	found = patchComponent(9334, "MemberRowItem", "lists", ["MemberRowItem"]) || found;
	found = patchComponent(10843, "DisplayName", "profiles", ["DisplayName"]) || found;
	found = patchVoiceMemberRows() || found;
	found = patchAvatar(13920, "default", ["Status"]) || found;
	found = patchAvatar(13920, "StatusWithTyping", ["StatusWithTyping"]) || found;
	return found;
}

function retryPatches() {
	if (options.enabled) installPatches();
}

function watchForPatches() {
	if (retryUnsubscribe || typeof Dispatcher?.subscribe !== "function" || typeof Dispatcher?.unsubscribe !== "function") return;
	const retry = () => retryPatches();
	const events = ["CONNECTION_OPEN", "MESSAGE_CREATE", "LOAD_MESSAGES_SUCCESS", "LOAD_MESSAGES_AROUND_SUCCESS"];
	for (const event of events) Dispatcher.subscribe(event, retry);
	retryUnsubscribe = () => {
		for (const event of events) Dispatcher.unsubscribe(event, retry);
		retryUnsubscribe = undefined;
	};
}

export function updateDeviceIndicatorOptions(next: Partial<DeviceIndicatorOptions>) {
	options = { ...options, ...next };
	storage.deviceIndicatorsEnabled = options.enabled;
	storage.deviceIndicatorDmHeader = options.dmHeader;
	storage.deviceIndicatorLists = options.lists;
	storage.deviceIndicatorProfiles = options.profiles;
	storage.deviceIndicatorHideMobileBadge = options.hideMobileBadge;
	if (options.enabled) {
		getStores();
		installPatches();
		watchForPatches();
	}
	try { messageStore?.emitChange?.(); } catch {}
}

export function initializeDeviceIndicators(next: Partial<DeviceIndicatorOptions>) {
	options = { ...options, ...next };
	getStores();
	if (options.enabled) {
		installPatches();
		watchForPatches();
	}
}

export function removeDeviceIndicatorPatches() {
	options = { ...options, enabled: false };
	for (const unpatch of unpatches.splice(0).reverse()) unpatch();
	patched.clear();
	retryUnsubscribe?.();
	try { messageStore?.emitChange?.(); } catch {}
}