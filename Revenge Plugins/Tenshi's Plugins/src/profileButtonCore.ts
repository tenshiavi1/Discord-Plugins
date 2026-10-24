export type ComponentTarget = { target: any; key: string };

export function componentMatches(value: any, names: readonly string[], seen = new Set<object>()): boolean {
	if (!value || (typeof value !== "object" && typeof value !== "function") || seen.has(value)) return false;
	seen.add(value);
	if (names.includes(value.displayName ?? value.name ?? "")) return true;
	return componentMatches(value.type, names, seen) || componentMatches(value.render, names, seen);
}

function resolveTarget(module: any, key: string): ComponentTarget | undefined {
	let target = module;
	let targetKey = key;
	let component = target?.[targetKey];
	while (component && typeof component !== "function") {
		if (typeof component.type === "function") {
			target = component;
			targetKey = "type";
		} else if (typeof component.render === "function") {
			target = component;
			targetKey = "render";
		} else {
			return undefined;
		}
		component = target[targetKey];
	}
	return typeof component === "function" ? { target, key: targetKey } : undefined;
}

export function findComponentTarget(module: any, names: readonly string[]): ComponentTarget | undefined {
	if (!module || (typeof module !== "object" && typeof module !== "function")) return undefined;
	const keys = [...new Set(["default", ...Object.keys(module)])];
	for (const key of keys) {
		if (componentMatches(module[key], names)) {
			const target = resolveTarget(module, key);
			if (target) return target;
		}
	}
	if (typeof module === "object" && module.$$typeof && componentMatches(module, names)) {
		if (typeof module.type === "function") return { target: module, key: "type" };
		if (typeof module.render === "function") return { target: module, key: "render" };
	}
	return undefined;
}

export function findDefaultComponentTarget(module: any): ComponentTarget | undefined {
	if (!module || (typeof module !== "object" && typeof module !== "function")) return undefined;
	return resolveTarget(module, "default");
}

export function selectComponentModule(
	direct: any,
	names: readonly string[],
	discover: (predicate: (candidate: any) => boolean) => any,
) {
	if (findComponentTarget(direct, names)) return direct;
	return discover((candidate) => Boolean(findComponentTarget(candidate, names)));
}
