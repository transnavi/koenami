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
