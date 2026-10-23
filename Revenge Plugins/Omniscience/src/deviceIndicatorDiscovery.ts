type ModuleLike = Record<string, any> & { default?: any };

function matchesName(value: unknown, names: readonly string[]) {
	if (typeof value !== "function") return false;
	const component = value as Function & { displayName?: string };
	return names.includes(component.displayName ?? component.name);
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
