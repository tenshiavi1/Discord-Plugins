import { expect, test } from "bun:test";
import { resolveComponentModule } from "./deviceIndicatorDiscovery";

test("resolves the containing module for named and default component exports", () => {
	function DisplayName() {}
	function Header() {}
	const named = { DisplayName, untouched: true };
	const defaultExport = { default: Header, sibling: true };

	expect(resolveComponentModule(named, "DisplayName", ["DisplayName"])).toBe(named);
	expect(resolveComponentModule(defaultExport, "default", ["Header"])).toBe(defaultExport);
	expect(resolveComponentModule(Header, "default", ["Header"])).toBeNull();
});