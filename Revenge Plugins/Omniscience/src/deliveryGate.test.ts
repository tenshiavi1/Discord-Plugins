import { expect, test } from "bun:test";
import { createDeliveryGate } from "./deliveryGate";

test("suppresses repeated and concurrent sends to the same destination", () => {
	const gate = createDeliveryGate();
	expect(gate.begin("delete:channel:message", "channel:destination")).toBe(true);
	expect(gate.begin("delete:channel:message", "channel:destination")).toBe(false);
	gate.finish("delete:channel:message", "channel:destination", true);
	expect(gate.begin("delete:channel:message", "channel:destination")).toBe(false);
});

test("keeps channel and webhook deliveries independent for one event", () => {
	const gate = createDeliveryGate();
	gate.begin("edit:channel:message:v1", "channel:destination");
	gate.finish("edit:channel:message:v1", "channel:destination", true);
	expect(gate.begin("edit:channel:message:v1", "webhook:destination")).toBe(true);
});

test("allows a failed delivery to be retried", () => {
	const gate = createDeliveryGate();
	gate.begin("delete:channel:message", "channel:destination");
	gate.finish("delete:channel:message", "channel:destination", false);
	expect(gate.begin("delete:channel:message", "channel:destination")).toBe(true);
});

test("bounds remembered successful events", () => {
	const gate = createDeliveryGate(1);
	gate.begin("event:one", "destination");
	gate.finish("event:one", "destination", true);
	gate.begin("event:two", "destination");
	gate.finish("event:two", "destination", true);
	expect(gate.begin("event:one", "destination")).toBe(true);
});