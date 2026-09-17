/* The measurement worker: the Rust engine, off the main thread.
 *
 * One message in, one message out, in arrival order — the engine holds the
 * thread for the length of a measurement (about 30 ms per second of audio),
 * so nothing here awaits anything but the module's one-time start and the
 * studio's drawing never waits on a measurement. A call whose id has been
 * cancelled is answered without measuring, so windows the listener has
 * already moved past cost nothing. */
import init, { analyze_json, live_json, to_mono16, version } from './pkg/koenami_measure.js';
import wasmUrl from './pkg/koenami_measure_bg.wasm?url';

export type MeasureCall =
	| { kind: 'analyze'; samples: Float32Array }
	| { kind: 'live'; samples: Float32Array }
	| { kind: 'mono16'; samples: Float32Array; channels: number; rate: number }
	| { kind: 'version' }
	| { kind: 'cancel'; cancel: number };
export type MeasureRequest = MeasureCall & { id: number };
export type MeasureResponse =
	| { id: number; json: string }
	| { id: number; samples: Float32Array }
	| { id: number; error: string }
	| { id: number; cancelled: true };

const ready = init({ module_or_path: wasmUrl });
// A rejected start is reported to every caller below; nothing here is left
// as an unhandled rejection, which a worker's `onerror` would not surface.
ready.catch(() => {});
const cancelled = new Set<number>();

self.onmessage = async ({ data }: MessageEvent<MeasureRequest>) => {
	if (data.kind === 'cancel') {
		cancelled.add(data.cancel);
		return;
	}
	try {
		await ready;
		if (cancelled.delete(data.id)) {
			self.postMessage({ id: data.id, cancelled: true } satisfies MeasureResponse);
			return;
		}
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
	self.postMessage({ id: data?.id ?? 0, error: 'The measurement request could not be read.' } satisfies MeasureResponse);
};
