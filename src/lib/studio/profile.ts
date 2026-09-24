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

/* One indicator: the voice's and the reference's values, the middle 80% of the reference
   speakers (q10–q90), and positions on a track spanning their 1st–99th percentile, widened to
   take in both values. Positions are percentages; null where there is nothing to place. */
export type Indicator = {
	metric: Metric;
	own: number | null | undefined;
	ref: number | null | undefined;
	speakers: number;
	band: [number, number] | null;
	marker: number | null;
	target: number | null;
	q10: number;
	q90: number;
};
export function indicator(metric: Metric, own: Features, ref: Features, refs: Clip[]): Indicator {
	const key = metric.key,
		values = refs.map((s) => s.features[key]).filter(finite);
	let lo = quantile(values, 0.01),
		hi = quantile(values, 0.99);
	if (!finite(lo) || hi <= lo) {
		lo = AXES[key].min;
		hi = AXES[key].max;
	}
	lo = Math.min(lo, own[key] ?? lo, ref[key] ?? lo);
	hi = Math.max(hi, own[key] ?? hi, ref[key] ?? hi);
	const pos = (v: number) => clamp(((v - lo) / (hi - lo || 1)) * 100, 0, 100),
		q10 = quantile(values, 0.1),
		q90 = quantile(values, 0.9);
	return {
		metric,
		own: own[key],
		ref: ref[key],
		speakers: values.length,
		band: finite(q10) ? [pos(q10), pos(q90) - pos(q10)] : null,
		marker: finite(own[key]) ? pos(own[key]) : null,
		target: finite(ref[key]) ? pos(ref[key]) : null,
		q10,
		q90
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
