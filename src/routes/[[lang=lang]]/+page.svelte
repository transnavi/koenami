<script lang="ts">
	import { mountStudio } from '$lib/studio/app';

	import '$lib/studio/studio.css';
	import { initLayout } from '$lib/studio/layout';
	import { initTour } from '$lib/studio/tour';
	import { onMount } from 'svelte';

	let { data } = $props();
	// The studio: one page of markup rendered from the catalogue, driven by the controller,
	// with the guide and the phone layout mounted after it, in the order the scripts ran on
	// the static page.
	onMount(() => {
		mountStudio();
		initTour(document.getElementById('tour-restart'));
		initLayout({
			browser: document.getElementById('sample-browser') as HTMLDialogElement,
			toggle: document.getElementById('samples-toggle') as HTMLButtonElement,
			scroll: document.getElementById('sample-scroll') as HTMLElement
		});
	});
</script>

<svelte:head>
	{@html data.head}
</svelte:head>

{@html data.body}
