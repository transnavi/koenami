<!-- The studio shell. It owns the app grid — toolbar row, studio, transport — and mounts the
	 controller over the template markup that still serves the regions not yet components: `main`
	 inside the studio after the profile panel, `body` for the transport, audio and dialogs. The
	 body's chrome (icon sprite, audio, dialogs) rides inside the grid but out of flow — hidden
	 audio and closed dialogs are not grid items, and the sprite is absolutely positioned. -->
<script lang="ts">
	import '$lib/studio/studio.css';
	import { mountStudio } from '$lib/studio/app';
	import { initLayout } from '$lib/studio/layout';
	import { provideStudio } from '$lib/studio/studio.svelte';
	import { initTour } from '$lib/studio/tour';
	import { onMount } from 'svelte';

	import ProfilePanel from './ProfilePanel.svelte';
	import Toolbar from './Toolbar.svelte';

	let { main, body }: { main: string; body: string } = $props();

	// This mount's isolated state, shared with child components through context.
	const studio = provideStudio();

	onMount(() => {
		const unmount = mountStudio(studio);
		initTour();
		initLayout({
			browser: document.getElementById('sample-browser') as HTMLDialogElement,
			toggle: document.getElementById('samples-toggle') as HTMLButtonElement,
			scroll: document.getElementById('sample-scroll') as HTMLElement
		});
		return unmount;
	});
</script>

<div class="app">
	<Toolbar />
	<main class="studio">
		<ProfilePanel />
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own prerendered markup -->
		{@html main}
	</main>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own prerendered markup -->
	{@html body}
</div>

<style>
	.app {
		height: 100dvh;
		display: grid;
		/* One column pinned to the viewport, so a crowded toolbar squeezes its language label instead of widening the page. */
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: 54px minmax(0, 1fr) 64px;
	}

	@media (max-width: 800px), (max-height: 520px) {
		.app {
			grid-template-rows: 48px minmax(0, 1fr) auto;
		}
	}

	@media (max-height: 520px) {
		.app {
			height: auto;
			min-height: 100dvh;
		}
	}
</style>
