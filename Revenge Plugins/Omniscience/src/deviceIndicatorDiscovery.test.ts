import { expect, test } from "bun:test";
import { findDeviceUserIdInTree, isDmChannelTitleNode, isDmListActionContainer, resolveComponentModule, resolveComponentTarget, resolveDeviceUserId, resolveNamedComponentModule } from "./deviceIndicatorDiscovery";

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

test("can target a production-minified component by its verified export key", () => {
	const module = {
		default: function e() {},
		MemberRowItem: function t() {},
	};

	expect(resolveComponentModule(module, "default", ["UserRow"], true)).toBe(module);
	expect(resolveComponentModule(module, "MemberRowItem", ["MemberRowItem"], true)).toBe(module);
	expect(resolveComponentModule(module, "default", ["UserRow"])).toBeNull();
	expect(resolveComponentTarget(module, "MemberRowItem")).toEqual({ target: module, key: "MemberRowItem" });
});

test("finds wrapped components when their module export key differs from their name", () => {
	function ProfileHeader() {}
	const module = { default: { UserProfileHeader: { type: ProfileHeader } } };

	expect(resolveNamedComponentModule(module, ["UserProfileHeader"])).toEqual({
		module: module.default,
		key: "UserProfileHeader",
	});
});

test("handles circular component wrappers", () => {
	const wrapper: { type?: unknown } = {};
	wrapper.type = wrapper;

	expect(resolveComponentModule({ default: wrapper }, "default", ["Missing"])).toBeNull();
});

test("resolves DM recipients and nested profile user props", () => {
	expect(resolveDeviceUserId({ channel: { recipientIds: ["dm-user"] } })).toBe("dm-user");
	expect(resolveDeviceUserId({ channel: { recipients: [{ id: "recipient-user" }] } })).toBe("recipient-user");
	expect(resolveDeviceUserId({ recipientId: "recipient-prop-user" })).toBe("recipient-prop-user");
	expect(resolveDeviceUserId({ recipient: { id: "recipient-object-user" } })).toBe("recipient-object-user");
	expect(resolveDeviceUserId({ channel: { recipients: ["one", "two"] } })).toBeUndefined();
	const profileTree = { props: { children: { props: { user: { id: "profile-user" } } } } };
	expect(findDeviceUserIdInTree(profileTree)).toBe("profile-user");
	expect(findDeviceUserIdInTree([{ props: { userId: "array-user" } }])).toBe("array-user");
});

test("identifies the channel title and action area used for DM indicator placement", () => {
	function ChannelTitle() {}
	const actionIcon = { props: { muted: false, selected: true, blocked: false } };
	const title = { type: ChannelTitle, props: { accessibleTitle: "Alex", title: "Alex", userId: "dm-user" } };
	const actionArea = { type: "View", props: { children: [actionIcon] } };

	expect(isDmChannelTitleNode(title)).toBe(true);
	expect(isDmChannelTitleNode({ ...title, props: { ...title.props, userId: undefined } })).toBe(false);
	expect(isDmListActionContainer(actionArea)).toBe(true);
	expect(isDmListActionContainer({ type: "View", props: { children: [] } })).toBe(false);
});
