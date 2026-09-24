import { indicator, METRICS } from '@app/studio/profile';
import type { Clip } from '@app/studio/types';
import { describe, it, expect } from 'vitest';

const f0 = METRICS.find((metric) => metric.key === 'f0')!;
// Reference speakers with f0 100, 101, …, 199 Hz.
const speakers = Array.from({ length: 100 }, (_, i) => ({ features: { f0: 100 + i } }) as Clip);

// An indicator places both voices on a track spanning the reference speakers' 1st–99th
// percentile, widened to take in either voice, with the speakers' middle 80% as a band.
describe('profile indicators', () => {
	it('places both voices and the band on the speakers’ range', () => {
		const row = indicator(f0, { f0: 150 }, { f0: 120 }, speakers);
		// Linear-interpolated percentiles of 100…199: 1st 100.99, 10th 109.9, 90th 189.1, 99th 198.01.
		const at = (hz: number) => ((hz - 100.99) / (198.01 - 100.99)) * 100;
		expect(row.speakers).toBe(100);
		expect(row.q10).toBeCloseTo(109.9);
		expect(row.q90).toBeCloseTo(189.1);
		expect(row.marker).toBeCloseTo(at(150));
		expect(row.target).toBeCloseTo(at(120));
		expect(row.band![0]).toBeCloseTo(at(109.9));
		expect(row.band![0] + row.band![1]).toBeCloseTo(at(189.1));
	});
	it('widens the track to take in a voice outside the speakers', () => {
		const row = indicator(f0, { f0: 300 }, {}, speakers);
		expect(row.marker).toBe(100);
		expect(row.target).toBeNull();
		expect(row.band![0] + row.band![1]).toBeLessThan(50);
	});
	it('falls back to the metric’s axis without reference speakers', () => {
		const row = indicator(f0, {}, {}, []);
		expect(row).toMatchObject({ speakers: 0, band: null, marker: null, target: null });
	});
});
