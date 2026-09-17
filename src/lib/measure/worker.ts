/* The measurement worker: the Rust engine, off the main thread.
 *
 * One message in, one message out. The engine holds the thread for the
 * length of a measurement (about 30 ms per second of audio), so nothing
 * here awaits anything but the module's one-time start, and the studio's
 * drawing never waits on a measurement. The studio's side posts one call
 * at a time, so a call it has abandoned is never posted at all. */
import init, { analyze_json, live_json, to_mono16, version } from './pkg/koenami_measure.js';
import wasmUrl from './pkg/koenami_measure_bg.wasm?url';

export type MeasureCall =
	| { kind: 'analyze'; samples: Float32Array }
	| { kind: 'live'; samples: Float32Array }
	| { kind: 'mono16'; samples: Float32Array; channels: number; rate: number }
	| { kind: 'version' };
export type MeasureRequest = MeasureCall & { id: number };
export type MeasureResponse =
	| { id: number; json: string }
	| { id: number; samples: Float32Array }
	| { id: number; error: string }
	/* The module did not start (the download or the compile failed): this
	 * worker cannot answer anything and the studio's side replaces it. */
	| { id: number; error: string; fatal: true };

const ready = init({ module_or_path: wasmUrl });
// Reported per call below; nothing is left as an unhandled rejection, which
// a worker's `onerror` would not surface.
ready.catch(() => {});

self.onmessage = async ({ data }: MessageEvent<MeasureRequest>) => {
	try {
		await ready;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		self.postMessage({ id: data.id, error: message, fatal: true } satisfies MeasureResponse);
		return;
	}
	try {
		if (data.kind === 'mono16') {
			const samples = to_mono16(data.samples, data.channels, data.rate);
			const response: MeasureResponse = { id: data.id, samples };
			self.postMessage(response, { transfer: [samples.buffer as ArrayBuffer] });
			return;
		}
		let json: string;
		if (data.kind === 'analyze') json = analyze_json(data.samples);
		else if (data.kind === 'live') json = live_json(data.samples);
		else json = version();
		self.postMessage({ id: data.id, json } satisfies MeasureResponse);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		self.postMessage({ id: data.id, error: message } satisfies MeasureResponse);
	}
};

self.onmessageerror = ({ data }: MessageEvent<Partial<MeasureRequest>>) => {
	self.postMessage({
		id: data?.id ?? 0,
		error: 'The measurement request could not be read.'
	} satisfies MeasureResponse);
};
