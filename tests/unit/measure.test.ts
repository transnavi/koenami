/* The browser engine measures what the native engine measures.
 *
 * The wasm module is loaded directly (no Worker, so this runs in node) and
 * its JSON is compared with the `koenami-measure` CLI on the same samples:
 * the libraries and a take have to carry numbers from one implementation.
 * Skipped where either build is missing. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wasm = `${root}src/lib/measure/pkg/koenami_measure_bg.wasm`;
const glue = `${root}src/lib/measure/pkg/koenami_measure.js`;
const cli = `${root}measure/target/release/koenami-measure`;
const built = existsSync(wasm) && existsSync(cli);
// A machine without both builds skips; CI has them, and a silent skip there
// would leave the two implementations uncompared.
if (!built && process.env.CI)
	throw new Error(
		'build the engine first: bun run build:wasm, and cargo build --release in measure/'
	);

/* Speech-like samples: a falling pitch with two resonances and a silent tail. */
function speech(seconds = 2) {
	const rate = 16000;
	const x = new Float32Array(Math.round(seconds * rate));
	for (let i = 0; i < x.length; i++) {
		const t = i / rate;
		if (t > seconds - 0.4) continue;
		const f0 = 180 - 30 * t;
		const phase = 2 * Math.PI * f0 * t;
		x[i] =
			0.5 * Math.sin(phase) +
			0.25 * Math.sin(2 * phase + 0.4) +
			0.12 * Math.sin(5 * phase) +
			0.05 * Math.sin(11 * phase) +
			0.01 * Math.sin(97 * t);
	}
	return x;
}

/* The module is started once: wasm-bindgen's glue holds one instance. */
let engine: Awaited<ReturnType<typeof import_>>;
async function import_() {
	return (await import(glue)) as {
		analyze_json: (x: Float32Array) => string;
		live_json: (x: Float32Array) => string;
		to_mono16: (x: Float32Array, channels: number, rate: number) => Float32Array;
		version: () => string;
		initSync: (input: { module: Buffer }) => unknown;
	};
}

describe.skipIf(!built)('the browser measurement engine', () => {
	beforeAll(async () => {
		engine = await import_();
		engine.initSync({ module: readFileSync(wasm) });
	});

	it('reports the same version as the native engine', () => {
		expect(engine.version()).toBe(execFileSync(cli, ['--version']).toString().trim());
	});

	it('measures a take exactly as the native engine does', () => {
		const { analyze_json } = engine;
		const x = speech();
		const browser = JSON.parse(analyze_json(x));
		const native = JSON.parse(
			execFileSync(cli, ['--pcm', '16000', '--detailed', '--visuals'], {
				input: Buffer.from(x.buffer),
				maxBuffer: 1 << 28
			}).toString()
		).measurement;
		// Wasm's libm and the platform's differ in the last bits, which the
		// pitch refinement can carry into a value; every decision — the frames,
		// which slots are filled, the gates — has to agree.
		expect(browser.version).toBe(native.version);
		expect(browser.reason).toBe(native.reason);
		expect(browser.track.map((row: { t: number }) => row.t)).toEqual(
			native.track.map((row: { t: number }) => row.t)
		);
		expect(browser.track.map((row: { f0: number | null }) => row.f0 === null)).toEqual(
			native.track.map((row: { f0: number | null }) => row.f0 === null)
		);
		expect(browser.quiet_intervals).toEqual(native.quiet_intervals);
		// The spectrogram is quantised to a byte per pixel; a pixel on a rounding
		// boundary may differ where the two libms do, so the frame is compared
		// with that tolerance rather than byte for byte.
		expect(browser.visuals.spectrogram.frames).toBe(native.visuals.spectrogram.frames);
		expect(browser.visuals.spectrogram.bins).toBe(native.visuals.spectrogram.bins);
		const pixels = (value: string) => Buffer.from(value, 'base64');
		const [left, right] = [
			pixels(browser.visuals.spectrogram.data),
			pixels(native.visuals.spectrogram.data)
		];
		expect(left.length).toBe(right.length);
		expect(left.every((value, i) => Math.abs(value - right[i]) <= 1)).toBe(true);
		for (const key of Object.keys(native.features)) {
			expect(browser.features[key]).toBeCloseTo(native.features[key], 6);
		}
		expect(browser.voiced_seconds).toBeCloseTo(native.voiced_seconds, 6);
		expect(browser.level_dbfs).toBeCloseTo(native.level_dbfs, 6);
	});

	it('answers a live window with whether the last half second carried speech', () => {
		const { live_json } = engine;
		expect(JSON.parse(live_json(speech(1.5))).active).toBe(true);
		// A window whose last half second is silent: the listener stopped talking.
		const stopped = speech(1.5);
		stopped.fill(0, stopped.length - 16000 * 0.6);
		expect(JSON.parse(live_json(stopped)).active).toBe(false);
		// The live view draws the window from these, as it did from the analyzer's.
		expect(JSON.parse(live_json(speech(1.5))).visuals.spectrogram.frames).toBeGreaterThan(0);
	});

	it('mixes and resamples what the studio imports', () => {
		const { to_mono16, analyze_json } = engine;
		const x = speech();
		const stereo = new Float32Array(x.length * 2);
		for (let i = 0; i < x.length; i++) {
			stereo[2 * i] = x[i];
			stereo[2 * i + 1] = x[i];
		}
		expect(Array.from(to_mono16(stereo, 2, 16000))).toEqual(Array.from(x));
		const resampled = to_mono16(x, 1, 48000);
		// rubato's output length can sit a sample or two either side of the ratio,
		// as the crate's own resampling test allows.
		expect(Math.abs(resampled.length - Math.round(x.length / 3))).toBeLessThanOrEqual(2);
		expect(JSON.parse(analyze_json(resampled)).duration).toBeCloseTo(x.length / 48000, 2);
		expect(() => to_mono16(new Float32Array(3), 2, 16000)).toThrow(/whole frames/);
	});
});
