type ModuleLike = Record<string, any> & { default?: any };

function matchesName(value: unknown, names: readonly string[], visited = new Set<object>()) {
	if (!value || (typeof value !== "function" && typeof value !== "object")) return false;
	if (visited.has(value)) return false;
	visited.add(value);
	const component = value as { displayName?: string; name?: string; type?: unknown; render?: unknown };
	if (names.includes(component.displayName ?? component.name ?? "")) return true;
	return matchesName(component.type, names, visited) || matchesName(component.render, names, visited);
}

export function resolveComponentModule(candidate: unknown, key: string, names: readonly string[]) {
	if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return null;
	const module = candidate as ModuleLike;
	if (key === "default") {
		return matchesName(module.default, names) ? module : null;
	}
	if (module.default && typeof module.default === "object" && matchesName(module.default[key], names)) return module.default;
	if (matchesName(module[key], names)) return module;
	return null;
}

export function resolveNamedComponentModule(candidate: unknown, names: readonly string[]) {
	if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return null;
	const module = candidate as ModuleLike;
	for (const [key, value] of Object.entries(module)) {
		if (names.includes(key) || matchesName(value, names)) return { module, key };
	}
	if (module.default && typeof module.default === "object") {
		for (const [key, value] of Object.entries(module.default)) {
			if (names.includes(key) || matchesName(value, names)) return { module: module.default, key };
		}
	}
	if (matchesName(module.default, names)) return { module, key: "default" };
	return null;
}

export function resolveComponentTarget(module: ModuleLike, key: string) {
	let target: Record<string, any> = module;
	let targetKey = key;
	let component = target[targetKey];
	while (component && typeof component !== "function") {
		if (typeof component.type === "function") {
			target = component;
			targetKey = "type";
		} else if (typeof component.render === "function") {
			target = component;
			targetKey = "render";
		} else {
			return null;
		}
		component = target[targetKey];
	}
	return typeof component === "function" ? { target, key: targetKey } : null;
}

function userIdFromValue(value: unknown): string | undefined {
	if (typeof value === "string" && value) return value;
	if (!value || typeof value !== "object") return undefined;
	const id = (value as { id?: unknown }).id;
	return typeof id === "string" && id ? id : undefined;
}

export function resolveDeviceUserId(props: any, getChannel?: (channelId: string) => any): string | undefined {
	const direct = userIdFromValue(props?.userId)
		?? userIdFromValue(props?.user)
		?? userIdFromValue(props?.recipientId)
		?? userIdFromValue(props?.recipient)
		?? userIdFromValue(props?.member?.userId)
		?? userIdFromValue(props?.member?.user);
	if (direct) return direct;
	const channel = props?.channel ?? (props?.channelId ? getChannel?.(props.channelId) : null);
	const recipients = channel?.recipientIds ?? channel?.recipients;
	if (Array.isArray(recipients) && recipients.length === 1) return userIdFromValue(recipients[0]);
	return undefined;
}

export function findDeviceUserIdInTree(tree: unknown, getChannel?: (channelId: string) => any): string | undefined {
	const visited = new Set<object>();
	function visit(node: any, depth: number): string | undefined {
		if (!node || depth > 18 || typeof node !== "object" || visited.has(node)) return undefined;
		visited.add(node);
		const userId = resolveDeviceUserId(node.props ?? node, getChannel);
		if (userId) return userId;
		const children = node.props?.children ?? node.children;
		if (Array.isArray(children)) {
			for (const child of children) {
				const nestedId = visit(child, depth + 1);
				if (nestedId) return nestedId;
			}
		} else if (children) {
			return visit(children, depth + 1);
		}
		return undefined;
	}
	return visit(tree, 0);
}

export function isDeviceStatusNode(node: any) {
	if (!node || typeof node !== "object" || !node.props) return false;
	if ("isMobileOnline" in node.props) return true;
	const names = new Set(["Status", "StatusWithTyping"]);
	return componentMatchesName(node.type, names);
}

export function isDeviceAvatarNode(node: any) {
	if (!node || typeof node !== "object" || !node.props) return false;
	return componentMatchesName(node.type, new Set(["Avatar", "UserAvatar", "ProfileAvatar"]));
}

function componentMatchesName(value: any, names: Set<string>, visited = new Set<object>()): boolean {
	if (!value || (typeof value !== "object" && typeof value !== "function") || visited.has(value)) return false;
	visited.add(value);
	if (names.has(value.displayName ?? value.name ?? "")) return true;
	return componentMatchesName(value.type, names, visited) || componentMatchesName(value.render, names, visited);
}
