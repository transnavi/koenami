/* The studio's side of the measurement worker.
 *
 * `analyze` and `live` answer with the same JSON the analyzer returned, so
 * a take is measured by the engine that built the reference libraries and
 * nothing waits on the network or on another listener's request. The worker
 * starts on the first call and stays; a caller that has moved on abandons
 * its answer through an `AbortSignal`, and the worker skips a call it has
 * not started yet. */
import type { Detail, PCM } from '$lib/studio/types';

import MeasureWorker from './worker?worker';
import type { MeasureCall, MeasureResponse } from './worker';

type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void };

let worker: Worker | null = null;
let next = 0;
const pending = new Map<number, Pending>();

function connect(): Worker {
	if (worker) return worker;
	worker = new MeasureWorker();
	worker.onmessage = ({ data }: MessageEvent<MeasureResponse>) => {
		const waiting = pending.get(data.id);
		if (!waiting) return;
		pending.delete(data.id);
		if ('error' in data) waiting.reject(new Error(data.error));
		else if ('cancelled' in data) waiting.reject(abortError());
		else waiting.resolve('json' in data ? data.json : data.samples);
	};
	worker.onerror = (event) =>
		fail(new Error(event.message || 'Measurement failed in the browser.'));
	return worker;
}

/* Every call in flight fails together: the worker holds the only engine, so
 * a worker that has stopped has stopped for all of them. */
function fail(error: Error) {
	for (const waiting of pending.values()) waiting.reject(error);
	pending.clear();
	worker?.terminate();
	worker = null;
}

function send<T>(call: MeasureCall, transfer: Transferable[], signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) return Promise.reject(abortError());
	const id = ++next;
	return new Promise<T>((resolve, reject) => {
		const abort = () => {
			if (!pending.delete(id)) return;
			worker?.postMessage({ kind: 'cancel', cancel: id, id: ++next });
			reject(abortError());
		};
		const settle = (run: () => void) => {
			signal?.removeEventListener('abort', abort);
			run();
		};
		pending.set(id, {
			resolve: (value) => settle(() => resolve(value as T)),
			reject: (error) => settle(() => reject(error))
		});
		signal?.addEventListener('abort', abort, { once: true });
		try {
			connect().postMessage({ ...call, id }, { transfer });
		} catch (error) {
			pending.delete(id);
			settle(() => reject(error instanceof Error ? error : new Error(String(error))));
		}
	});
}

function abortError() {
	const error = new Error('Measurement was cancelled.');
	error.name = 'AbortError';
	return error;
}

/* Copies the samples so the caller keeps its own buffer: the studio holds a
 * take's PCM for playback and export after it is measured. */
function copy(samples: Float32Array): Float32Array {
	return samples.slice();
}

/** What the studio stores for a take: the measurement with track and visuals. */
export async function analyze(pcm: PCM, signal?: AbortSignal): Promise<Detail> {
	const samples = copy(pcm);
	return JSON.parse(await send<string>({ kind: 'analyze', samples }, [samples.buffer], signal));
}

/** One live window, with `active` for whether the last half second carried speech. */
export async function live(pcm: PCM, signal?: AbortSignal): Promise<Detail> {
	const samples = copy(pcm);
	return JSON.parse(await send<string>({ kind: 'live', samples }, [samples.buffer], signal));
}

/** Mixes interleaved samples to the mono 16 kHz the engine measures. */
export async function mono16(
	samples: Float32Array,
	channels: number,
	rate: number,
	signal?: AbortSignal
): Promise<PCM> {
	if (!Number.isInteger(channels) || channels < 1)
		throw new Error('Audio must have a whole number of channels.');
	if (!Number.isFinite(rate) || rate <= 0) throw new Error('Audio must carry a sample rate.');
	const owned = copy(samples);
	return (await send<Float32Array>(
		{ kind: 'mono16', samples: owned, channels, rate },
		[owned.buffer],
		signal
	)) as PCM;
}

/** The engine's measurement version, for comparing a stored take with it. */
export function version(): Promise<string> {
	return send<string>({ kind: 'version' }, []);
}

/** Drops the worker; calls in flight fail and the next call starts a new one. */
export function stop() {
	fail(abortError());
}
