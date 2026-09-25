/* The profile panel's measurements: the five metrics, where a voice sits on each against the
   reference speakers, and the shape the profile chart draws. No DOM here; the components in
   components/ProfilePanel.svelte render it. */
import { message, messages } from '$lib/i18n';
import { AXES, clamp, finite, quantile } from '$lib/math';
import { m } from '$lib/paraglide/messages';
import type { MetricKey } from '$lib/score';
import type { Features } from '$lib/space';

import type { Clip } from './types';

export type HelpEntry = {
	label: string;
	description: string;
	factors: string[];
	caveats: string[];
};
/* Anything with measured features: a reference clip, a speaker's representative. */
export type Measured = { features: Features };
export type Metric = HelpEntry & { key: MetricKey; unit: string; n: number };

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

export const VERDICT_HELP: HelpEntry = {
	get label() {
		return m.verdict_help_label();
	},
	get description() {
		return m.verdict_help_description();
	},
	get factors() {
		return messages('verdict_help_factors');
	},
	get caveats() {
		return messages('verdict_help_caveats');
	}
};

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

/* The profile chart: a pentagon per voice, each axis scaled to the reference speakers' 1st–99th
   percentile of that metric. Colours are read from the page's custom properties. */
export function drawProfile(canvas: HTMLCanvasElement, own: Features, ref: Features, refs: Clip[]) {
	const w = canvas.clientWidth,
		h = canvas.clientHeight;
	if (!w || !h) return;
	const dpr = Math.min(devicePixelRatio || 1, 2);
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	const c = canvas.getContext('2d')!;
	c.scale(dpr, dpr);
	const css = getComputedStyle(document.documentElement),
		color = (k: string) => css.getPropertyValue(k).trim();
	const cx = w / 2,
		cy = h / 2 + 3,
		r = Math.min(w / 2 - 28, h / 2 - 23);
	const limits = METRICS.map((metric) => {
		const values = refs.map((p) => p.features[metric.key]).filter(finite);
		return [quantile(values, 0.01), quantile(values, 0.99)];
	});
	const point = (i: number, ratio: number): [number, number] => [
		cx + Math.sin((i * Math.PI * 2) / 5) * r * ratio,
		cy - Math.cos((i * Math.PI * 2) / 5) * r * ratio
	];
	c.strokeStyle = color('--line');
	c.lineWidth = 1;
	for (const scale of [0.33, 0.66, 1]) {
		c.beginPath();
		for (let i = 0; i < 5; i++) {
			const p = point(i, scale);
			if (i) c.lineTo(...p);
			else c.moveTo(...p);
		}
		c.closePath();
		c.stroke();
	}
	c.font = '10px system-ui';
	c.textAlign = 'center';
	c.fillStyle = color('--muted');
	for (let i = 0; i < 5; i++) {
		const p = point(i, 1),
			label = point(i, 1.27);
		c.beginPath();
		c.moveTo(cx, cy);
		c.lineTo(...p);
		c.stroke();
		c.fillText(METRICS[i].label, label[0], label[1] + 3);
	}
	for (const [f, key, dash] of [
		[ref, '--reference', []],
		[own, '--self', [4, 3]]
	] as [Features, string, number[]][]) {
		if (!METRICS.every((metric) => finite(f[metric.key]))) continue;
		const pts = METRICS.map((metric, i) =>
			point(
				i,
				0.12 +
					0.88 * clamp((f[metric.key]! - limits[i][0]) / (limits[i][1] - limits[i][0] || 1), 0, 1)
			)
		);
		c.beginPath();
		pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
		c.closePath();
		c.strokeStyle = color(key);
		c.lineWidth = 2;
		c.setLineDash(dash);
		c.stroke();
		c.setLineDash([]);
		c.fillStyle = color(key);
		c.globalAlpha = 0.06;
		c.fill();
		c.globalAlpha = 1;
		for (const p of pts) {
			c.beginPath();
			c.arc(...p, 2.5, 0, Math.PI * 2);
			c.fill();
		}
	}
}
