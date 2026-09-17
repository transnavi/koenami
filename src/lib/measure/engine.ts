/* The studio's side of the measurement worker.
 *
 * `analyze` and `live` answer with the same JSON the analyzer returned, so
 * a take is measured by the engine that built the reference libraries and
 * nothing waits on the network or on another listener's request. The worker
 * starts on the first call and stays; a caller that has moved on abandons
 * its answer through an `AbortSignal`. */
import type { Detail, PCM } from '$lib/studio/types';
import MeasureWorker from './worker?worker';
import type { MeasureCall, MeasureResponse } from './worker';

type Pending = { resolve: (value: never) => void; reject: (reason: Error) => void };

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
		else waiting.resolve(('json' in data ? data.json : data.samples) as never);
	};
	worker.onerror = (event) => {
		const failure = new Error(event.message || 'Measurement failed in the browser.');
		for (const waiting of pending.values()) waiting.reject(failure);
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	return worker;
}

function send<T>(call: MeasureCall, transfer: Transferable[], signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) return Promise.reject(abortError());
	const id = ++next;
	return new Promise<T>((resolve, reject) => {
		pending.set(id, { resolve: resolve as (value: never) => void, reject });
		signal?.addEventListener(
			'abort',
			() => {
				if (pending.delete(id)) reject(abortError());
			},
			{ once: true },
		);
		connect().postMessage({ ...call, id }, { transfer });
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
export async function mono16(samples: Float32Array, channels: number, rate: number): Promise<PCM> {
	const owned = copy(samples);
	return (await send<Float32Array>({ kind: 'mono16', samples: owned, channels, rate }, [owned.buffer])) as PCM;
}

/** The engine's measurement version, for comparing a stored take with it. */
export function version(): Promise<string> {
	return send<string>({ kind: 'version' }, []);
}

/** Drops the worker; the next call starts a new one. */
export function stop() {
	worker?.terminate();
	worker = null;
	pending.clear();
}
