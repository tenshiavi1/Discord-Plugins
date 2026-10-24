import { expect, test } from "bun:test";
import { findComponentTarget, findDefaultComponentTarget, selectComponentModule } from "./profileButtonCore";

const names = ["YouBarButtons", "YouBarNotificationsButton"];

test("rejects a stale direct module ID and discovers the matching profile component", () => {
	const unrelated = { default: function MessageRow() {} };
	const profileComponent = function YouBarNotificationsButton() {};
	const profileModule = { default: profileComponent };
	let predicate: ((candidate: any) => boolean) | undefined;
	const selected = selectComponentModule(unrelated, names, (match) => {
		predicate = match;
		return match(profileModule) ? profileModule : undefined;
	});

	expect(selected).toBe(profileModule);
	expect(predicate?.(unrelated)).toBe(false);
	expect(findComponentTarget(selected, names)).toEqual({ target: profileModule, key: "default" });
});

test("resolves memo-wrapped profile components to their shared render function", () => {
	const render = function YouBarButtons() {};
	const memoComponent = { $$typeof: Symbol.for("react.memo"), type: render };
	const module = { default: memoComponent };

	expect(findComponentTarget(module, names)).toEqual({ target: memoComponent, key: "type" });
});

test("resolves an unnamed default export from the verified YouBar module", () => {
	const component = function e() {};
	const module = { default: component };

	expect(findDefaultComponentTarget(module)).toEqual({ target: module, key: "default" });
});

test("does not select an unrelated module when discovery has no profile component", () => {
	const unrelated = { default: function MessageRow() {} };
	expect(selectComponentModule(unrelated, names, () => undefined)).toBeUndefined();
});
