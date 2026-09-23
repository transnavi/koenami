<!-- The studio shell. It owns the app grid — toolbar row, studio, transport — and mounts the
	 controller over the body that still serves the not-yet-migrated regions. Each region that
	 moves out of the `{@html}` body becomes a sibling component here. The body's remaining
	 chrome (icon sprite, audio, dialogs) rides inside the grid but out of flow — hidden audio
	 and closed dialogs are not grid items, and the sprite is absolutely positioned. -->
<script lang="ts">
	import type { Language } from '$lib/i18n';

	import '$lib/studio/studio.css';
	import { mountStudio } from '$lib/studio/app';
	import { initLayout } from '$lib/studio/layout';
	import { provideStudio } from '$lib/studio/studio.svelte';
	import { initTour } from '$lib/studio/tour';
	import { onMount } from 'svelte';

	import Toolbar from './Toolbar.svelte';

	let { body, lang }: { body: string; lang: Language } = $props();

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
	<Toolbar {lang} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- the studio body is our own prerendered markup -->
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
