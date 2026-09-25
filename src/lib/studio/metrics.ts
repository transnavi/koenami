/* The five measurements the studio reports, and where a voice sits on each against reference
   speakers. Pure: the profile panel's components render it. */
import { message, messages } from '$lib/i18n';
import { AXES, clamp, finite, quantile } from '$lib/math';
import type { MetricKey } from '$lib/score';
import type { Features } from '$lib/space';

export type HelpEntry = {
	label: string;
	description: string;
	factors: string[];
	caveats: string[];
};
export type Metric = HelpEntry & { key: MetricKey; unit: string; n: number };
/* Anything with measured features: a reference clip, a speaker's representative. */
export type Measured = { features: Features };

export const fmt = (v: unknown, n = 0) => (finite(v) ? v.toFixed(n) : '—');

// The texts resolve when read, in the page's locale.
export const METRICS: Metric[] = (
	['f0', 'delta_f', 'hnr', 'balance', 'pitch_span'] as MetricKey[]
).map((key, i) => ({
	key,
	n: [0, 0, 1, 1, 1][i],
	get label() {
		return message(`metric_${key}_label`)();
	},
	get unit() {
		return message(`metric_${key}_unit`)();
	},
	get description() {
		return message(`metric_${key}_description`)();
	},
	get factors() {
		return messages(`metric_${key}_factors`);
	},
	get caveats() {
		return messages(`metric_${key}_caveats`);
	}
}));

/* A metric's spread among reference speakers: the span an indicator's track covers (their
   1st–99th percentile, or the metric's axis where they give none) and their middle 80%. */
export type Spread = {
	metric: Metric;
	speakers: number;
	lo: number;
	hi: number;
	q10: number;
	q90: number;
};
export function spread(metric: Metric, speakers: readonly Measured[]): Spread {
	const values = speakers.map((s) => s.features[metric.key]).filter(finite);
	let lo = quantile(values, 0.01),
		hi = quantile(values, 0.99);
	if (!finite(lo) || hi <= lo) {
		lo = AXES[metric.key].min;
		hi = AXES[metric.key].max;
	}
	return {
		metric,
		speakers: values.length,
		lo,
		hi,
		q10: quantile(values, 0.1),
		q90: quantile(values, 0.9)
	};
}

/* One indicator: the voice's and the reference's values, and where they and the speakers'
   middle 80% fall on the track, as percentages of its width. The track widens to take in both
   values; a position is null where there is nothing to place. */
export type Indicator = {
	own: number | null | undefined;
	ref: number | null | undefined;
	ownAt: number | null;
	refAt: number | null;
	band: { left: number; width: number } | null;
};
export function indicator(spread: Spread, own: Features, ref: Features): Indicator {
	const key = spread.metric.key,
		lo = Math.min(spread.lo, own[key] ?? spread.lo, ref[key] ?? spread.lo),
		hi = Math.max(spread.hi, own[key] ?? spread.hi, ref[key] ?? spread.hi),
		at = (v: number) => clamp(((v - lo) / (hi - lo || 1)) * 100, 0, 100);
	return {
		own: own[key],
		ref: ref[key],
		ownAt: finite(own[key]) ? at(own[key]) : null,
		refAt: finite(ref[key]) ? at(ref[key]) : null,
		band: finite(spread.q10)
			? { left: at(spread.q10), width: at(spread.q90) - at(spread.q10) }
			: null
	};
}
