import { expect, test } from "bun:test";
import { resolveComponentModule, resolveComponentTarget } from "./deviceIndicatorDiscovery";

test("resolves the containing module for named and default component exports", () => {
	function DisplayName() {}
	function Header() {}
	const named = { DisplayName, untouched: true };
	const defaultExport = { default: Header, sibling: true };

	expect(resolveComponentModule(named, "DisplayName", ["DisplayName"])).toBe(named);
	expect(resolveComponentModule(defaultExport, "default", ["Header"])).toBe(defaultExport);
	expect(resolveComponentModule(Header, "default", ["Header"])).toBeNull();
});

test("discovers and targets memo and forwardRef component wrappers", () => {
	function MemberRow() {}
	function ProfileHeader() {}
	const memo = { default: { displayName: "Memo(MemberRow)", type: MemberRow } };
	const forwardRef = { default: { render: ProfileHeader } };

	expect(resolveComponentModule(memo, "default", ["MemberRow"])).toBe(memo);
	expect(resolveComponentModule(forwardRef, "default", ["ProfileHeader"])).toBe(forwardRef);
	expect(resolveComponentTarget(memo, "default")).toEqual({ target: memo.default, key: "type" });
	expect(resolveComponentTarget(forwardRef, "default")).toEqual({ target: forwardRef.default, key: "render" });
});

test("handles circular component wrappers", () => {
	const wrapper: { type?: unknown } = {};
	wrapper.type = wrapper;

	expect(resolveComponentModule({ default: wrapper }, "default", ["Missing"])).toBeNull();
});