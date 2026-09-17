import { finite, quantile, clamp, AXES } from '@app/math';
import { describe, it, expect } from 'vitest';

import { golden } from './golden';

describe('math', () => {
	it('finite accepts only finite numbers', () => {
		golden(
			'math.finite',
			[0, -1.5, NaN, Infinity, -Infinity, '1', null, undefined, true].map((v) => finite(v))
		);
	});
	it('quantile: empty, single, sorted interpolation, unsorted input', () => {
		golden('math.quantile', {
			empty: quantile([], 0.5),
			single: [0, 0.5, 1].map((p) => quantile([7], p)),
			two: [0, 0.25, 0.5, 0.75, 1].map((p) => quantile([1, 3], p)),
			unsorted: [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99].map((p) =>
				quantile([5, 1, 4, 2, 3, 9, 0.5], p)
			),
			untouched: (() => {
				const a = [3, 1, 2];
				quantile(a, 0.5);
				return a;
			})()
		});
	});
	it('clamp', () => {
		golden(
			'math.clamp',
			[
				[5, 0, 1],
				[-1, 0, 1],
				[0.5, 0, 1],
				[NaN, 0, 1],
				[2, 3, 1]
			].map(([x, a, b]) => clamp(x, a, b))
		);
	});
	it('AXES table', () => {
		golden('math.axes', AXES);
		expect(Object.keys(AXES)).toEqual(['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']);
	});
});
