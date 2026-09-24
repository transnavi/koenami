<!-- The five measurements as a pentagon per voice, scaled to the reference speakers. It redraws
     when a measurement, the reference speakers, the theme or its size changes. -->
<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	import { drawProfile } from '../profile';
	import { useStudio } from '../studio.svelte';

	const studio = useStudio();

	let canvas: HTMLCanvasElement;
	let width = $state(0),
		height = $state(0);

	$effect(() => {
		// The colours come from the theme's custom properties; the size from layout.
		void studio.dark;
		void width;
		void height;
		drawProfile(canvas, studio.ownFeatures, studio.refFeatures, studio.representatives);
	});
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
