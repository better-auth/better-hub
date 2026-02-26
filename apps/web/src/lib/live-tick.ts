/**
 * Shared tick for LiveDuration components. One interval drives all subscribers
 * instead of each component running its own 1s interval.
 */
const callbacks = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

export function subscribeLiveTick(callback: () => void): () => void {
	callbacks.add(callback);
	if (intervalId === null) {
		intervalId = setInterval(() => {
			callbacks.forEach((cb) => cb());
		}, 1000);
	}
	return () => {
		callbacks.delete(callback);
		if (callbacks.size === 0 && intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};
}
