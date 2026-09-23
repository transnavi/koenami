<script module lang="ts">
	import { browser } from '$app/environment';
	import { defineKoeSelect } from '$lib/koe-select';

	// The menus are custom elements shared by every page that uses one: define the element
	// before the tree renders it, so its value and disabled accessors bind as properties.
	if (browser) defineKoeSelect();
</script>

<script lang="ts">
	import { onMount } from 'svelte';

	import '../app.css';
	let { children } = $props();
	// Pages wire themselves on mount; the attribute tells the characterization harness
	// that the page is running (its old counterpart was ready at the load event). A parent's
	// onMount runs after its children's, so the flag appears once the page's controller
	// has mounted; it must stay here rather than move into the pages.
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

{@render children()}
