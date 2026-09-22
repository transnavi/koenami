<!-- The studio shell. It hosts the page and mounts the controller, the guide and the phone
	 layout in the order the scripts ran on the static page. Regions of the studio move out of
	 the `{@html}` body into sibling components over the course of the refactor; until a region
	 has moved it is still served by `data.body` and wired by `mountStudio()`. -->
<script lang="ts">
	import { mountStudio } from '$lib/studio/app';

	import '$lib/studio/studio.css';
	import { initLayout } from '$lib/studio/layout';
	import { provideStudio } from '$lib/studio/studio.svelte';
	import { initTour } from '$lib/studio/tour';
	import { onMount } from 'svelte';

	let { body }: { body: string } = $props();

	// This mount's isolated state, shared with child components through context.
	const studio = provideStudio();

	onMount(() => {
		mountStudio(studio);
		initTour(document.getElementById('tour-restart'));
		initLayout({
			browser: document.getElementById('sample-browser') as HTMLDialogElement,
			toggle: document.getElementById('samples-toggle') as HTMLButtonElement,
			scroll: document.getElementById('sample-scroll') as HTMLElement
		});
	});
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- the studio body is our own prerendered markup -->
{@html body}
