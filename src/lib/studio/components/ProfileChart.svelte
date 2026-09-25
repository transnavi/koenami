<!-- The five measurements as a pentagon per voice, each axis scaled to the 1st–99th percentile
     of that measurement among all reference speakers (both groups). It redraws when a
     measurement, the reference speakers, the theme or its size changes. -->
<script lang="ts">
	import { clamp, finite, quantile } from '$lib/math';
	import { m } from '$lib/paraglide/messages';
	import type { Features } from '$lib/space';

	import { METRICS, type Measured } from '../profile';
	import { useStudio } from '../studio.svelte';

	const studio = useStudio();

	let canvas: HTMLCanvasElement | undefined = $state();
	let width = $state(0),
		height = $state(0);

	// Every theme change goes through the store's setTheme, which updates `dark` after writing
	// the document's theme, so the custom properties read here are already the new ones.
	$effect(() => {
		void studio.dark;
		if (canvas && width && height)
			draw(canvas, width, height, studio.ownFeatures, studio.refFeatures, studio.representatives);
	});

	function draw(
		canvas: HTMLCanvasElement,
		w: number,
		h: number,
		own: Features,
		ref: Features,
		speakers: readonly Measured[]
	) {
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
			const values = speakers.map((s) => s.features[metric.key]).filter(finite);
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
</script>

<canvas
	id="profile-canvas"
	aria-label={m.profile_canvas_aria()}
	bind:this={canvas}
	bind:clientWidth={width}
	bind:clientHeight={height}
></canvas>

<style>
	canvas {
		height: 122px;
		width: 100%;
		flex-shrink: 0;
	}

	@media (max-height: 760px) and (min-width: 801px) {
		canvas {
			height: 95px;
		}
	}

	@media (max-width: 800px), (max-height: 520px) {
		canvas {
			display: none;
		}
	}
</style>
