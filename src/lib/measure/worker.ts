/* The measurement worker: the Rust engine, off the main thread.
 *
 * One message in, one message out, in arrival order. The engine holds the
 * thread for the length of a measurement (about 30 ms per second of audio),
 * so the studio's drawing never waits on it. */
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
	| { id: number; error: string };

const ready = init({ module_or_path: wasmUrl });

self.onmessage = async ({ data }: MessageEvent<MeasureRequest>) => {
	await ready;
	try {
		if (data.kind === 'mono16') {
			const samples = to_mono16(data.samples, data.channels, data.rate);
			const response: MeasureResponse = { id: data.id, samples };
			self.postMessage(response, { transfer: [samples.buffer as ArrayBuffer] });
			return;
		}
		const json =
			data.kind === 'analyze' ? analyze_json(data.samples) : data.kind === 'live' ? live_json(data.samples) : version();
		self.postMessage({ id: data.id, json } satisfies MeasureResponse);
	} catch (error) {
		self.postMessage({ id: data.id, error: (error as Error).message ?? String(error) } satisfies MeasureResponse);
	}
};
