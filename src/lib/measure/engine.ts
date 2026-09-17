/* The studio's side of the measurement worker.
 *
 * `analyze` and `live` answer with the same JSON the analyzer returned, so
 * a take is measured by the engine that built the reference libraries and
 * nothing waits on the network or on another listener's request. Calls
 * queue here and go to the worker one at a time, so a call abandoned
 * through its `AbortSignal` before its turn is never measured; only the one
 * in flight runs to completion, and its answer is dropped. The worker
 * starts on the first call and stays; one that cannot start, or that
 * fails, fails every call in flight and is replaced on the next call. */
import type { Detail, PCM } from '$lib/studio/types';

import MeasureWorker from './worker?worker';
import type { MeasureCall, MeasureResponse } from './worker';

type Queued = {
	id: number;
	call: MeasureCall;
	transfer: Transferable[];
	resolve: (value: unknown) => void;
	reject: (reason: Error) => void;
	release: () => void;
};

let worker: Worker | null = null;
let next = 0;
const queue: Queued[] = [];
let inflight: Queued | null = null;
type Kind = 'analyze' | 'live';
type Hold = { kind: Kind | undefined; until: Promise<void>; release: () => void };
const holds: Hold[] = [];
const failures: { kind: Kind | undefined; message: string; times: number }[] = [];
const patches = new Map<Kind, (detail: Detail) => Detail>();

/** The browser suite's hold on the engine, where it used to intercept the
 * analyzer's routes; `kind` narrows a hold or a failure to takes
 * (`analyze`) or live windows. `hold()` keeps the next call waiting until
 * the returned release runs, `fail(message, kind, times)` fails the next
 * `times` calls (`Infinity` until `restore`) before they reach the worker,
 * `patch(kind, fn)` reshapes every answer of that kind (`null` restores
 * it), `restore(kind)` drops the failures of a kind. The studio exposes it
 * on `window.voiceApp.measure`. */
export const gate = {
	hold(kind?: Kind): () => void {
		let release = () => {};
		const until = new Promise<void>((resolve) => {
			release = () => {
				const at = holds.indexOf(hold);
				if (at >= 0) holds.splice(at, 1);
				resolve();
				pump();
			};
		});
		const hold: Hold = { kind, until, release };
		holds.push(hold);
		return release;
	},
	fail(message: string, kind?: Kind, times = 1) {
		failures.push({ kind, message, times });
	},
	restore(kind?: Kind) {
		for (let i = failures.length - 1; i >= 0; i--)
			if (!kind || failures[i].kind === kind) failures.splice(i, 1);
	},
	patch(kind: Kind, fn: ((detail: Detail) => Detail) | null) {
		if (fn) patches.set(kind, fn);
		else patches.delete(kind);
	}
};

function kindOf(call: MeasureCall): Kind | undefined {
	return call.kind === 'analyze' || call.kind === 'live' ? call.kind : undefined;
}

function connect(): Worker {
	if (worker) return worker;
	worker = new MeasureWorker();
	worker.onmessage = ({ data }: MessageEvent<MeasureResponse>) => {
		if ('fatal' in data) return fail(new Error(data.error));
		const current = inflight;
		// A late answer to a call nobody is waiting for is dropped.
		if (current?.id === data.id) {
			inflight = null;
			if ('error' in data) current.reject(new Error(data.error));
			else current.resolve('json' in data ? data.json : data.samples);
		} else if (inflight?.id === data.id) inflight = null;
		pump();
	};
	worker.onerror = (event) =>
		fail(new Error(event.message || 'Measurement failed in the browser.'));
	return worker;
}

/* Posts the next call when none is in flight. */
function pump() {
	if (inflight || !queue.length) return;
	const kind = kindOf(queue[0].call);
	// A held call keeps its place at the head; its release pumps again.
	const hold = holds.find((h) => !h.kind || h.kind === kind);
	if (hold) {
		void hold.until.then(pump);
		return;
	}
	const head = queue.shift()!;
	const failure = failures.find((f) => !f.kind || f.kind === kind);
	if (failure) {
		if (--failure.times <= 0) failures.splice(failures.indexOf(failure), 1);
		head.reject(new Error(failure.message));
		pump();
		return;
	}
	inflight = head;
	try {
		connect().postMessage({ ...head.call, id: head.id }, { transfer: head.transfer });
	} catch (error) {
		inflight = null;
		head.reject(error instanceof Error ? error : new Error(String(error)));
		pump();
	}
}

/* Every call fails together: the worker holds the only engine, so a worker
 * that has stopped has stopped for all of them. */
function fail(error: Error) {
	const waiting = [...(inflight ? [inflight] : []), ...queue];
	inflight = null;
	queue.length = 0;
	for (const call of waiting) call.reject(error);
	worker?.terminate();
	worker = null;
}

function send<T>(call: MeasureCall, transfer: Transferable[], signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) return Promise.reject(abortError());
	const id = ++next;
	return new Promise<T>((resolve, reject) => {
		const entry: Queued = {
			id,
			call,
			transfer,
			resolve: (value) => settle(() => resolve(value as T)),
			reject: (error) => settle(() => reject(error)),
			release: () => signal?.removeEventListener('abort', abort)
		};
		function settle(run: () => void) {
			entry.release();
			run();
		}
		function abort() {
			const at = queue.indexOf(entry);
			if (at >= 0) queue.splice(at, 1);
			else if (inflight === entry) inflight = null;
			else return;
			entry.reject(abortError());
			pump();
		}
		signal?.addEventListener('abort', abort, { once: true });
		queue.push(entry);
		pump();
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
	const detail = JSON.parse(
		await send<string>({ kind: 'analyze', samples }, [samples.buffer], signal)
	);
	return patches.get('analyze')?.(detail) ?? detail;
}

/** One live window, with `active` for whether the last half second carried speech. */
export async function live(pcm: PCM, signal?: AbortSignal): Promise<Detail> {
	const samples = copy(pcm);
	const detail = JSON.parse(
		await send<string>({ kind: 'live', samples }, [samples.buffer], signal)
	);
	return patches.get('live')?.(detail) ?? detail;
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
