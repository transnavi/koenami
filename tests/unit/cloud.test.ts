import { describe, it, beforeEach, vi } from 'vitest';
import { golden, sha256 } from './golden';

// A recording 2D context: DensityCloud only needs createImageData/putImageData on its
// own canvas and drawImage on the target.
// Every putImageData call is hashed and summarised, since the cloud reuses one raster for
// both groups and only the call sequence shows each layer.
function fakeDocument() {
	const calls: unknown[] = [];
	let canvas = { width: 0, height: 0 };
	const ctx = {
		createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
		putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) => {
			const alpha = img.data.filter((_, i) => i % 4 === 3);
			let painted = 0, peak = 0;
			for (const a of alpha) { if (a) painted++; if (a > peak) peak = a; }
			calls.push({ call: 'putImageData', width: img.width, height: img.height, x, y, painted, peak, sample: Array.from(img.data.slice(((img.height >> 1) * img.width + (img.width >> 1)) * 4, ((img.height >> 1) * img.width + (img.width >> 1)) * 4 + 8)), sha256: sha256(img.data) });
		}
	};
	// Each DensityCloud owns a fresh canvas, as document.createElement would give it.
	const createElement = () => (canvas = { width: 0, height: 0, getContext: () => ctx } as typeof canvas);
	return { createElement, calls, canvas: () => canvas };
}

const { DensityCloud } = await import('@app/cloud');

const colors = { male: '#4f8ac9', female: '#d9689a' };
function points(n: number, seed: number) {
	let s = seed;
	const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
	return Array.from({ length: n }, (_, i) => ({
		xy: [rnd() * 640 - 20, rnd() * 400 - 20],
		sample: { group: i % 3 === 0 ? 'male' : 'female', speaker: 's' + (i % 7), synthetic: i % 11 === 0 }
	}));
}

describe('DensityCloud', () => {
	let fake: ReturnType<typeof fakeDocument>;
	beforeEach(() => {
		fake = fakeDocument();
		vi.stubGlobal('document', { createElement: fake.createElement });
	});

	async function run(pts: ReturnType<typeof points>, opts: Record<string, unknown>, cloud = new DensityCloud()) {
		const target: unknown[] = [];
		cloud.draw({ drawImage: (_c: unknown, ...args: number[]) => target.push(args) }, pts, opts as never);
		const calls = await Promise.all(fake.calls.splice(0).map(async (c) => ({ ...(c as object), sha256: await (c as { sha256: Promise<string> }).sha256 })));
		return { size: [fake.canvas().width, fake.canvas().height], calls, drawImage: target };
	}

	it('renders both groups at typical scale, light and dark', async () => {
		const light = await run(points(60, 3), { width: 640, height: 400, scale: 500, colors, dark: false });
		const dark = await run(points(60, 3), { width: 640, height: 400, scale: 500, colors, dark: true });
		golden('cloud.groups', { light, dark });
	});
	it('reuses buffers when the size is unchanged and reallocates when it grows', async () => {
		const cloud = new DensityCloud();
		const a = await run(points(20, 4), { width: 300, height: 200, scale: 100, colors, dark: false }, cloud);
		const b = await run(points(20, 5), { width: 300, height: 200, scale: 100, colors, dark: false }, cloud);
		const c = await run(points(20, 5), { width: 900, height: 500, scale: 2000, colors, dark: false }, cloud);
		golden('cloud.resize', { a, b, c });
	});
	it('skips empty groups, out-of-range points and synthetic samples', async () => {
		const only = points(30, 6).map((p) => ({ ...p, sample: { ...p.sample, group: 'female' } }));
		const away = points(10, 7).map((p) => ({ ...p, xy: [p.xy[0] + 5000, p.xy[1] - 5000] }));
		golden('cloud.sparse', {
			femaleOnly: await run(only, { width: 320, height: 240, scale: 300, colors, dark: false }),
			outOfRange: await run(away, { width: 320, height: 240, scale: 300, colors, dark: false }),
			synthetic: await run(points(12, 8).map((p) => ({ ...p, sample: { ...p.sample, synthetic: true } })), { width: 320, height: 240, scale: 300, colors, dark: false }),
			badColour: await run(points(30, 9), { width: 320, height: 240, scale: 300, colors: { male: 'red', female: 'blue' }, dark: true })
		});
	});
});
