/* The browser engine measures what the native engine measures.
 *
 * The wasm module is loaded directly (no Worker, so this runs in node) and
 * its JSON is compared with the `koenami-measure` CLI on the same samples:
 * the libraries and a take have to carry numbers from one implementation.
 * Skipped where either build is missing. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const wasm = `${root}src/lib/measure/pkg/koenami_measure_bg.wasm`;
const glue = `${root}src/lib/measure/pkg/koenami_measure.js`;
const cli = `${root}measure/target/release/koenami-measure`;
const built = existsSync(wasm) && existsSync(cli);

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

async function load() {
	const module = await import(glue);
	module.initSync({ module: readFileSync(wasm) });
	return module;
}

describe.skipIf(!built)('the browser measurement engine', () => {
	it('reports the same version as the native engine', async () => {
		const { version } = await load();
		expect(version()).toBe(execFileSync(cli, ['--version']).toString().trim());
	});

	it('measures a take exactly as the native engine does', async () => {
		const { analyze_json } = await load();
		const x = speech();
		const browser = JSON.parse(analyze_json(x));
		const native = JSON.parse(
			execFileSync(cli, ['--pcm', '16000', '--detailed', '--visuals'], { input: Buffer.from(x.buffer), maxBuffer: 1 << 28 }).toString(),
		).measurement;
		// Wasm's libm and the platform's differ in the last bits, which the
		// pitch refinement can carry into a value; every decision — the frames,
		// which slots are filled, the gates — has to agree.
		expect(browser.version).toBe(native.version);
		expect(browser.reason).toBe(native.reason);
		expect(browser.track.map((row: { t: number }) => row.t)).toEqual(native.track.map((row: { t: number }) => row.t));
		expect(browser.track.map((row: { f0: number | null }) => row.f0 === null)).toEqual(
			native.track.map((row: { f0: number | null }) => row.f0 === null),
		);
		expect(browser.quiet_intervals).toEqual(native.quiet_intervals);
		expect(browser.visuals.spectrogram).toEqual(native.visuals.spectrogram);
		for (const key of Object.keys(native.features)) {
			expect(browser.features[key]).toBeCloseTo(native.features[key], 6);
		}
		expect(browser.voiced_seconds).toBeCloseTo(native.voiced_seconds, 6);
		expect(browser.level_dbfs).toBeCloseTo(native.level_dbfs, 6);
	});

	it('answers a live window with whether the last half second carried speech', async () => {
		const { live_json } = await load();
		expect(JSON.parse(live_json(speech(1.5))).active).toBe(true);
		// A window whose last half second is silent: the listener stopped talking.
		const stopped = speech(1.5);
		stopped.fill(0, stopped.length - 16000 * 0.6);
		expect(JSON.parse(live_json(stopped)).active).toBe(false);
		expect(JSON.parse(live_json(speech(1.5))).visuals ?? null).toBe(null);
	});

	it('mixes and resamples what the studio imports', async () => {
		const { to_mono16, analyze_json } = await load();
		const x = speech();
		const stereo = new Float32Array(x.length * 2);
		for (let i = 0; i < x.length; i++) {
			stereo[2 * i] = x[i];
			stereo[2 * i + 1] = x[i];
		}
		expect(Array.from(to_mono16(stereo, 2, 16000))).toEqual(Array.from(x));
		const resampled = to_mono16(x, 1, 48000);
		expect(resampled.length).toBe(Math.round(x.length / 3));
		expect(JSON.parse(analyze_json(resampled)).duration).toBeCloseTo(x.length / 48000, 2);
		expect(() => to_mono16(new Float32Array(3), 2, 16000)).toThrow(/whole frames/);
	});
});
