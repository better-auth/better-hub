/**
 * Resumable stream implementation using @upstash/redis for storage
 * and in-process EventEmitter for pub/sub.
 *
 * Adapted from https://github.com/vercel/resumable-stream
 */
import { after } from "next/server";
import { EventEmitter } from "events";
import { redis } from "./redis";

const KEY_PREFIX = "resumable-stream:rs";
const DONE_MESSAGE = "\n\n\nDONE_SENTINEL_hasdfasudfyge374%$%^$EDSATRTYFtydryrte\n";
const DONE_VALUE = "DONE";
const EXPIRY_SECONDS = 24 * 60 * 60;

// In-process pub/sub — works because producer (POST) and consumer (GET)
// run in the same server process.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function debugLog(...messages: unknown[]) {
	if (process.env.DEBUG) {
		console.log("[resumable-stream]", ...messages);
	}
}

interface ResumeStreamMessage {
	listenerId: string;
	skipCharacters?: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const streamContext = {
	/**
	 * Create a new resumable stream (called from POST handler).
	 */
	async createNewResumableStream(
		streamId: string,
		makeStream: () => ReadableStream<string>,
	): Promise<ReadableStream<string> | null> {
		await redis.set(`${KEY_PREFIX}:sentinel:${streamId}`, "1", {
			ex: EXPIRY_SECONDS,
		});
		return createNewResumableStream(streamId, makeStream);
	},

	/**
	 * Resume an existing stream (called from GET handler).
	 */
	async resumeExistingStream(
		streamId: string,
		skipCharacters?: number,
	): Promise<ReadableStream<string> | null | undefined> {
		const state = await redis.get<string>(`${KEY_PREFIX}:sentinel:${streamId}`);
		if (!state) return undefined;
		if (state === DONE_VALUE) return null;
		return resumeStream(streamId, skipCharacters);
	},
};

// ─── Internal ───────────────────────────────────────────────────────────────

async function createNewResumableStream(
	streamId: string,
	makeStream: () => ReadableStream<string>,
): Promise<ReadableStream<string> | null> {
	const chunks: string[] = [];
	const listenerChannels: string[] = [];
	let isDone = false;

	let streamDoneResolver: () => void;
	after(
		new Promise<void>((resolve) => {
			streamDoneResolver = resolve;
		}),
	);

	// Listen for resume requests from consumers
	const onRequest = async (message: string) => {
		const parsed = JSON.parse(message) as ResumeStreamMessage;
		debugLog("Connected to listener", parsed.listenerId);
		listenerChannels.push(parsed.listenerId);

		const chunksToSend = chunks.join("").slice(parsed.skipCharacters || 0);
		emitter.emit(`${KEY_PREFIX}:chunk:${parsed.listenerId}`, chunksToSend);

		if (isDone) {
			emitter.emit(`${KEY_PREFIX}:chunk:${parsed.listenerId}`, DONE_MESSAGE);
		}
	};
	emitter.on(`${KEY_PREFIX}:request:${streamId}`, onRequest);

	return new ReadableStream<string>({
		start(controller) {
			const stream = makeStream();
			const reader = stream.getReader();

			function read() {
				reader.read().then(async ({ done, value }) => {
					if (done) {
						isDone = true;
						debugLog("Stream done");
						try {
							controller.close();
						} catch {
							// stream already closed
						}

						await redis.set(
							`${KEY_PREFIX}:sentinel:${streamId}`,
							DONE_VALUE,
							{ ex: EXPIRY_SECONDS },
						);
						emitter.removeListener(
							`${KEY_PREFIX}:request:${streamId}`,
							onRequest,
						);
						for (const listenerId of listenerChannels) {
							emitter.emit(
								`${KEY_PREFIX}:chunk:${listenerId}`,
								DONE_MESSAGE,
							);
						}
						streamDoneResolver?.();
						return;
					}

					chunks.push(value);
					try {
						controller.enqueue(value);
					} catch {
						// stream closed by client, but we continue buffering
					}

					for (const listenerId of listenerChannels) {
						emitter.emit(
							`${KEY_PREFIX}:chunk:${listenerId}`,
							value,
						);
					}
					read();
				});
			}
			read();
		},
	});
}

function resumeStream(
	streamId: string,
	skipCharacters?: number,
): Promise<ReadableStream<string> | null> {
	const listenerId = crypto.randomUUID();

	return new Promise<ReadableStream<string> | null>((resolve, reject) => {
		const readableStream = new ReadableStream<string>({
			async start(controller) {
				try {
					const cleanup = () => {
						emitter.removeAllListeners(
							`${KEY_PREFIX}:chunk:${listenerId}`,
						);
					};

					const start = Date.now();
					const timeout = setTimeout(async () => {
						cleanup();
						const val = await redis.get<string>(
							`${KEY_PREFIX}:sentinel:${streamId}`,
						);
						if (val === DONE_VALUE) {
							resolve(null);
							return;
						}
						if (Date.now() - start > 1000) {
							controller.error(
								new Error(
									"Timeout waiting for ack",
								),
							);
						}
					}, 1000);

					emitter.on(
						`${KEY_PREFIX}:chunk:${listenerId}`,
						async (message: string) => {
							debugLog("Received message", message);
							clearTimeout(timeout);
							resolve(readableStream);

							if (message === DONE_MESSAGE) {
								try {
									controller.close();
								} catch {
									// already closed
								}
								cleanup();
								return;
							}

							try {
								controller.enqueue(message);
							} catch {
								cleanup();
							}
						},
					);

					// Ask the producer to replay buffered chunks
					emitter.emit(
						`${KEY_PREFIX}:request:${streamId}`,
						JSON.stringify({ listenerId, skipCharacters }),
					);
				} catch (e) {
					reject(e);
				}
			},
		});
	});
}
