export function createDeliveryGate(maxRememberedEvents = 1000) {
	const inFlight = new Set<string>();
	const delivered = new Map<string, Set<string>>();
	const getDeliveryKey = (eventKey: string, destinationKey: string) => `${eventKey}\u0000${destinationKey}`;

	return {
		hasDelivered(eventKey: string, destinationKey: string) {
			return delivered.get(eventKey)?.has(destinationKey) ?? false;
		},
		begin(eventKey: string, destinationKey: string) {
			const key = getDeliveryKey(eventKey, destinationKey);
			if (inFlight.has(key) || this.hasDelivered(eventKey, destinationKey)) return false;
			inFlight.add(key);
			return true;
		},
		finish(eventKey: string, destinationKey: string, succeeded: boolean) {
			inFlight.delete(getDeliveryKey(eventKey, destinationKey));
			if (!succeeded) return;

			const destinations = delivered.get(eventKey) ?? new Set<string>();
			destinations.add(destinationKey);
			delivered.delete(eventKey);
			delivered.set(eventKey, destinations);
			while (delivered.size > maxRememberedEvents) {
				const oldestEvent = delivered.keys().next().value;
				if (oldestEvent === undefined) break;
				delivered.delete(oldestEvent);
			}
		},
	};
}