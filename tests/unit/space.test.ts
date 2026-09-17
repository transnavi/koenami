import { describe, it, test, expect } from 'vitest';

import library from '../fixtures/library-ja.json';
import { golden } from './golden';

const { AcousticSpace } = await import('@app/space');

type Clip = { id: string; speaker: string; group: string; features: Record<string, number> };
const clips = library.clips as Clip[];

// Deterministic synthetic clips: group means differ, per-clip jitter from a tiny LCG.
function synthetic(n: number, group: string, seed: number, spread = 1) {
	let s = seed;
	const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * spread;
	const base = group === 'female' ? [220, 1150, 14, -18, 8] : [120, 950, 11, -24, 5];
	return Array.from({ length: n }, (_, i) => ({
		id: `${group}-${i}`,
		speaker: `${group}${i % 5}`,
		group,
		features: {
			f0: base[0] + rnd() * 30,
			delta_f: base[1] + rnd() * 80,
			hnr: base[2] + rnd() * 4,
			balance: base[3] + rnd() * 5,
			pitch_span: base[4] + rnd() * 3
		}
	}));
}
const probe = { f0: 180, delta_f: 1050, hnr: 12, balance: -20, pitch_span: 7 };
const other = { f0: 130, delta_f: 900, hnr: 9, balance: -26, pitch_span: 4 };

type Projection = { axes: number[][]; values: number[]; bounds: number[][] };
const projectionsOf = (space: InstanceType<typeof AcousticSpace>) =>
	space.projections as unknown as Record<string, Projection>;
function summary(space: InstanceType<typeof AcousticSpace>) {
	const projections = projectionsOf(space);
	return {
		center: space.center,
		scale: space.scale,
		mean: space.mean,
		projections: Object.fromEntries(
			Object.entries(projections).map(([k, p]) => [
				k,
				{ axes: p.axes, values: p.values, bounds: p.bounds }
			])
		),
		vector: {
			variance: space.vector(probe),
			contrast: space.vector(probe, 'contrast'),
			missing: space.vector({ f0: NaN })
		},
		distance: [
			space.distance(probe, other),
			space.distance(probe, {}),
			space.distance(probe, probe)
		],
		comparison: [
			space.comparison(probe, other),
			space.comparison(probe, other, 2, 'contrast'),
			space.comparison(probe, probe),
			space.comparison(probe, { f0: 0 })
		],
		explained: [
			space.explained(),
			space.explained(3),
			space.explained(2, 'contrast'),
			space.explained(2, 'nonexistent')
		],
		standardized: [
			space.standardized(probe),
			space.standardized({ f0: -1, delta_f: 1, hnr: 1, balance: 1, pitch_span: 1 })
		]
	};
}

describe('AcousticSpace', () => {
	it('static helpers', () => {
		golden('space.static', {
			keys: AcousticSpace.keys,
			raw: [
				AcousticSpace.raw(probe),
				AcousticSpace.raw({ f0: 0, delta_f: 1 }),
				AcousticSpace.raw(undefined),
				AcousticSpace.raw({ f0: -3 })
			],
			mean: [
				AcousticSpace.mean([]),
				AcousticSpace.mean([
					[1, 2, 3, 4, 5],
					[3, 4, 5, 6, 7]
				])
			],
			covariance: [
				AcousticSpace.covariance([[1, 2, 3, 4, 5]]),
				AcousticSpace.covariance([
					[1, 2, 3, 4, 5],
					[2, 1, 5, 3, 4],
					[0, 0, 1, 1, 2]
				])
			]
		});
	});
	it('library: variance and contrast projections', () => {
		const space = new AcousticSpace(clips);
		expect(projectionsOf(space).contrast).toBeDefined();
		golden('space.library', summary(space));
	});
	it('empty and all-invalid sample sets', () => {
		golden('space.empty', summary(new AcousticSpace([])));
		golden(
			'space.invalid',
			summary(new AcousticSpace([{ features: { f0: 0 } }, { features: null }, {}]))
		);
	});
	it('unlabeled and under-populated classes give no contrast axis', () => {
		const few = new AcousticSpace([
			...synthetic(15, 'female', 1),
			...synthetic(40, 'male', 2),
			...synthetic(10, 'androgynous', 3)
		]);
		expect(projectionsOf(few).contrast).toBeUndefined();
		golden('space.few-per-class', summary(few));
	});
	it('identical class means give no contrast axis', () => {
		// The same rows in the same order under both labels: the class means cancel exactly.
		const rows = synthetic(20, 'female', 5);
		const mirrored = [...rows, ...rows.map((c) => ({ ...c, id: c.id + 'b', group: 'male' }))];
		const space = new AcousticSpace(mirrored);
		expect(projectionsOf(space).contrast).toBeUndefined();
		golden('space.zero-difference', summary(space));
	});
	it('perfectly correlated features force pivoting in the Fisher solve', () => {
		// Pitch varies far less than resonance (after the scale floors), and both follow one
		// latent value, so the within-class covariance needs a row swap to eliminate.
		const make = (group: string, seed: number, shift: number) =>
			synthetic(24, group, seed, 0).map((c, i) => {
				const t = ((i * 37) % 24) / 24 - 0.5;
				return {
					...c,
					features: {
						...c.features,
						f0: 2 ** ((90 + shift + 0.1 * t) / 12),
						delta_f: 1000 + shift * 10 + 30 * t
					}
				};
			});
		golden(
			'space.pivot',
			summary(new AcousticSpace([...make('female', 11, 6), ...make('male', 12, 0)]))
		);
	});
	it('degenerate within-class covariance (constant features) still projects', () => {
		const f = synthetic(20, 'female', 7, 0),
			m = synthetic(20, 'male', 8, 0);
		golden('space.degenerate', summary(new AcousticSpace([...f, ...m])));
	});
	it('one varying dimension exercises orthogonalize rejection', () => {
		// Only pitch differs and varies, so the Fisher axis is exactly the pitch unit vector and
		// the same eigenvector of the within-class covariance is rejected as redundant.
		const rest = { delta_f: 1000, hnr: 10, balance: -20, pitch_span: 6 };
		const f = synthetic(20, 'female', 9, 0).map((c, i) => ({
			...c,
			features: { ...rest, f0: 200 + i }
		}));
		const m = synthetic(20, 'male', 10, 0).map((c, i) => ({
			...c,
			features: { ...rest, f0: 120 + i }
		}));
		golden('space.one-dimension', summary(new AcousticSpace([...f, ...m])));
	});
});

test('loads without a window (workers and the server-side scorer)', async () => {
	const win = globalThis.window;
	// @ts-expect-error the global is removed for the duration of the import
	delete globalThis.window;
	try {
		const fresh = await import('@app/space?no-window');
		expect(fresh.AcousticSpace.keys).toEqual(AcousticSpace.keys);
	} finally {
		globalThis.window = win;
	}
});
