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
