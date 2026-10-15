import {
	find as metroFind,
	findByName as metroFindByName,
	findByProps as metroFindByProps,
	findByPropsAll as metroFindByPropsAll,
	findByStoreName as metroFindByStoreName,
} from "@vendetta/metro";

type ModulePredicate = (candidate: any) => boolean;

let fallbackWarningShown = false;

function warnFallback(kind: string) {
	if (fallbackWarningShown) return;
	fallbackWarningShown = true;
	console.warn(`[Revenge Plugins] Used compatibility discovery for ${kind}; an upstream module lookup may have changed.`);
}

function scanModules(kind: string, predicate: ModulePredicate) {
	if (typeof metroFind !== "function") {
		console.error(`[Revenge Plugins] Module discovery is unavailable while resolving ${kind}.`);
		return undefined;
	}

	try {
		const result = metroFind(predicate);
		if (result) warnFallback(kind);
		return result;
	} catch (error) {
		console.error(`[Revenge Plugins] Compatibility discovery failed while resolving ${kind}.`, error);
		return undefined;
	}
}

export function find(predicate: ModulePredicate) {
	if (typeof metroFind !== "function") {
		console.error("[Revenge Plugins] Discord's module finder is unavailable.");
		return undefined;
	}
	try {
		return metroFind(predicate);
	} catch (error) {
		console.error("[Revenge Plugins] Discord's module finder failed.", error);
		return undefined;
	}
}

export function findByProps(...props: string[]) {
	if (typeof metroFindByProps === "function") {
		try {
			const result = metroFindByProps(...props);
			if (result && props.every((prop) => prop in Object(result))) return result;
		} catch (error) {
			console.warn("[Revenge Plugins] Standard module lookup failed; trying compatibility discovery.", error);
		}
	}

	const result = scanModules(`module properties (${props.join(", ")})`, (candidate) => {
		const module = candidate?.default ?? candidate;
		return module !== null && (typeof module === "object" || typeof module === "function")
			&& props.every((prop) => prop in module);
	});
	const defaultModule = result?.default;
	return defaultModule && props.every((prop) => prop in Object(defaultModule)) ? defaultModule : result;
}

export function findByPropsAll(...props: string[]) {
	if (typeof metroFindByPropsAll === "function") {
		try {
			const results = metroFindByPropsAll(...props);
			if (Array.isArray(results)) return results;
		} catch (error) {
			console.warn("[Revenge Plugins] Standard multi-module lookup failed; trying compatibility discovery.", error);
		}
	}

	warnFallback(`multi-module lookup (${props.join(", ")})`);
	const result = findByProps(...props);
	return result ? [result] : [];
}

export function findByName(name: string, defaultExport = true) {
	if (typeof metroFindByName === "function") {
		try {
			const result = metroFindByName(name, defaultExport);
			if (result) return result;
		} catch (error) {
			console.warn(`[Revenge Plugins] Standard name lookup failed for ${name}; trying compatibility discovery.`, error);
		}
	}

	const module = scanModules(`module name (${name})`, (candidate) => {
		if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return false;
		if (typeof candidate.default === "function" && candidate.default.name === name) return true;
		if (typeof candidate[name] === "function") return true;
		return Object.values(candidate).some((value) => typeof value === "function" && value.name === name);
	});
	if (!module) return undefined;

	if (defaultExport && typeof module.default === "function" && module.default.name === name) {
		return module.default;
	}
	if (typeof module[name] === "function") return module[name];
	if (typeof module.default === "function" && module.default.name === name) return module.default;
	return module;
}

export function findByStoreName(...names: string[]) {
	if (typeof metroFindByStoreName === "function") {
		for (const name of names) {
			try {
				const result = metroFindByStoreName(name);
				if (result) return result;
			} catch (error) {
				console.warn(`[Revenge Plugins] Standard store lookup failed for ${name}; trying compatibility discovery.`, error);
			}
		}
	}

	return scanModules(`store name (${names.join(", ")})`, (candidate) => {
		if (!candidate || (typeof candidate !== "object" && typeof candidate !== "function")) return false;
		const store = candidate.default ?? candidate;
		const displayName = store.displayName ?? store._dispatchToken;
		const storeName = typeof store.getName === "function" ? store.getName() : undefined;
		return names.includes(displayName) || names.includes(storeName);
	});
}
