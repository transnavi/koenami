import { describe, it, expect } from 'vitest';

import library from '../fixtures/library-ja.json';

const { AcousticSpace } = await import('@app/space');
const { blendedScores, fiveMeasureDistances, TIMBRE_WEIGHT } = await import('@app/similar');

type Clip = { id: string; speaker: string; group: string; features: Record<string, number> };
const clips = (library.clips as Clip[]).filter((c) => c.features?.f0);
const space = new AcousticSpace(clips);

describe('fiveMeasureDistances', () => {
	it('is zero for a speaker whose single clip is the take', () => {
		const one = clips.find((c) => clips.filter((d) => d.speaker === c.speaker).length === 1)!;
		expect(fiveMeasureDistances(space, clips, one.features).get(one.speaker)).toBeCloseTo(0, 9);
	});
	it('measures from the mean of a speaker’s clips', () => {
		const speaker = clips.find(
			(c) => clips.filter((d) => d.speaker === c.speaker).length > 1
		)!.speaker;
		const mine = clips.filter((c) => c.speaker === speaker);
		const centre = mine
			.map((c) => space.standardized(c.features)!)
			.reduce((a, v) => a.map((x, k) => x + v[k] / mine.length), [0, 0, 0, 0, 0]);
		const probe = mine[0].features;
		const q = space.standardized(probe)!;
		const expected = Math.hypot(...centre.map((x, k) => x - q[k]));
		expect(fiveMeasureDistances(space, clips, probe).get(speaker)).toBeCloseTo(expected, 9);
	});
	it('is empty for a take without measurements', () => {
		expect(fiveMeasureDistances(space, clips, {}).size).toBe(0);
	});
});

describe('blendedScores', () => {
	const timbre = new Map([
		['a', 0.1],
		['b', 0.2],
		['c', 0.3],
		['d', 0.4]
	]);
	it('follows the descriptor alone when the five measures are missing', () => {
		const order = [...blendedScores(timbre, new Map())].sort((x, y) => x[1] - y[1]).map(([k]) => k);
		expect(order).toEqual(['a', 'b', 'c', 'd']);
	});
	it('lets the five measures reorder near ties', () => {
		const close = new Map([
			['a', 0.2],
			['b', 0.2001],
			['c', 0.9],
			['d', 1.0]
		]);
		const five = new Map([
			['a', 3],
			['b', 0],
			['c', 1],
			['d', 2]
		]);
		const order = [...blendedScores(close, five)].sort((x, y) => x[1] - y[1]).map(([k]) => k);
		expect(order.slice(0, 2)).toEqual(['b', 'a']);
		expect(order.slice(2)).toEqual(['c', 'd']);
	});
	it('weights the descriptor three to one', () => {
		const five = new Map([
			['a', 4],
			['b', 3],
			['c', 2],
			['d', 1]
		]);
		const s = blendedScores(timbre, five);
		// Both inputs are equally spaced, so their z-scores are mirror images and the blend is
		// (2 * weight - 1) times the descriptor's z-score.
		const zA = (0.1 - 0.25) / Math.sqrt(0.0125);
		expect(s.get('a')).toBeCloseTo((2 * TIMBRE_WEIGHT - 1) * zA, 9);
	});
	it('keeps a speaker that has no five-measure distance', () => {
		const s = blendedScores(
			timbre,
			new Map([
				['a', 1],
				['b', 2],
				['c', 3]
			])
		);
		expect(s.has('d')).toBe(true);
		expect(Number.isFinite(s.get('d'))).toBe(true);
	});
});
