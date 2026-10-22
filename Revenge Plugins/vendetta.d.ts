declare namespace JSX {
	interface IntrinsicAttributes {
		key?: string | number;
	}
}

declare module "@vendetta/metro" {
	export function find(predicate: (candidate: any) => boolean): any;
	export function findByName(name: string, defaultExport?: boolean): any;
	export function findByProps(...props: string[]): any;
	export function findByPropsAll(...props: string[]): any[];
	export function findByStoreName(name: string): any;
}

declare module "@vendetta/metro/common" {
	export namespace React {
		type ComponentType<P = any> = (props: P) => any;
	}

	export const React: {
		useState<S>(initialState: S | (() => S)): [S, (nextState: S | ((previousState: S) => S)) => void];
		useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
		useRef<T>(initialValue: T): { current: T };
		useReducer<S>(reducer: (state: S) => S, initialState: S): [S, () => void];
		useReducer<S, A>(reducer: (state: S, action: A) => S, initialState: S): [S, (action: A) => void];
		createElement(type: any, props?: any, ...children: any[]): any;
		cloneElement(element: any, props?: any, ...children: any[]): any;
		memo<P>(component: (props: P) => any, compare?: (previous: P, next: P) => boolean): (props: P) => any;
	};

	export const ReactNative: any;
	export const FluxDispatcher: {
		dispatch(event: any): void;
		subscribe(eventType: string, listener: (event: any) => void): void;
		unsubscribe(eventType: string, listener: (event: any) => void): void;
	};
	export const NavigationNative: { useNavigation(): any };
	export const clipboard: { getString(): Promise<string>; setString(value: string): void };
	export const constants: Record<string, any>;
	export const toasts: any;
}

declare module "@vendetta/commands" {
	export function registerCommand(command: any): () => void;
}

declare module "@vendetta/patcher" {
	type PatchCallback = (args: any[], result?: any) => any;
	export function before(method: string, module: any, callback: PatchCallback): () => void;
	export function after(method: string, module: any, callback: PatchCallback): () => void;
	export function instead(method: string, module: any, callback: PatchCallback): () => void;
}

declare module "@vendetta/plugin" {
	export const storage: Record<string, any>;
}

declare module "@vendetta/plugins" {
	export const plugins: any;
	export function getSettings(pluginId: string): any;
	export function installPlugin(url: string, enabled?: boolean): Promise<any>;
	export function removePlugin(pluginId: string): Promise<any>;
	export function startPlugin(pluginId: string): Promise<any>;
	export function stopPlugin(pluginId: string, force?: boolean): Promise<any>;
}

declare module "@vendetta/storage" {
	export function useProxy<T extends object>(value: T): T;
	export function createMMKVBackend(key: string): {
		get<T = unknown>(...args: any[]): Promise<T | undefined>;
		set(...args: any[]): Promise<void>;
	};
}

declare module "@vendetta/ui/alerts" {
	export function showConfirmationAlert(options: any): void;
}

declare module "@vendetta/ui/assets" {
	export function getAssetIDByName(name: string): any;
}

declare module "@vendetta/ui/toasts" {
	export function showToast(message: string, icon?: any): void;
}

declare module "@vendetta/utils" {
	export function findInReactTree<T = any>(tree: any, predicate: (node: any) => boolean): T | undefined;
}

declare module "bun:test" {
	export const afterEach: (callback: () => void | Promise<void>) => void;
	export const expect: (actual: any) => any;
	export const test: (name: string, callback: () => void | Promise<void>) => void;
}