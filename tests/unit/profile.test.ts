import { AXES } from '@app/math';
import { indicator, METRICS, spread } from '@app/studio/profile';
import { describe, it, expect } from 'vitest';

const f0 = METRICS.find((metric) => metric.key === 'f0')!;
// Reference speakers with f0 100, 101, …, 199 Hz.
const speakers = Array.from({ length: 100 }, (_, i) => ({ features: { f0: 100 + i } }));
// Linear-interpolated percentiles of 100…199: 1st 100.99, 10th 109.9, 90th 189.1, 99th 198.01.
const onTrack = (hz: number) => ((hz - 100.99) / (198.01 - 100.99)) * 100;
const onAxis = (hz: number) => ((hz - AXES.f0.min) / (AXES.f0.max - AXES.f0.min)) * 100;

// An indicator places both voices on a track spanning the reference speakers' 1st–99th
// percentile, widened to take in either voice, with the speakers' middle 80% as a band.
describe('metric indicators', () => {
	it('places both voices and the band on the speakers’ range', () => {
		const s = spread(f0, speakers);
		expect(s).toMatchObject({ speakers: 100 });
		expect(s.q10).toBeCloseTo(109.9);
		expect(s.q90).toBeCloseTo(189.1);
		const row = indicator(s, { f0: 150 }, { f0: 120 });
		expect(row.ownAt).toBeCloseTo(onTrack(150));
		expect(row.refAt).toBeCloseTo(onTrack(120));
		expect(row.band!.left).toBeCloseTo(onTrack(109.9));
		expect(row.band!.left + row.band!.width).toBeCloseTo(onTrack(189.1));
	});
	it('widens the track to take in a voice outside the speakers', () => {
		const row = indicator(spread(f0, speakers), { f0: 300 }, {});
		expect(row.ownAt).toBe(100);
		expect(row.refAt).toBeNull();
		expect(row.band!.left + row.band!.width).toBeLessThan(50);
	});
	it('uses the metric’s axis when there are no reference speakers', () => {
		const row = indicator(spread(f0, []), { f0: 200 }, {});
		expect(row.ownAt).toBeCloseTo(onAxis(200));
		expect(row.band).toBeNull();
	});
	it('uses the metric’s axis when the speakers give no range', () => {
		const s = spread(f0, [{ features: { f0: 180 } }]);
		expect(s).toMatchObject({ speakers: 1, lo: AXES.f0.min, hi: AXES.f0.max });
		const row = indicator(s, { f0: 200 }, {});
		expect(row.ownAt).toBeCloseTo(onAxis(200));
		expect(row.band!.width).toBe(0);
	});
});
