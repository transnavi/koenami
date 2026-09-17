<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	let { children } = $props();
	// Pages wire themselves on mount; the attribute tells the characterization harness
	// that the page is running (its old counterpart was ready at the load event).
	onMount(() => {
		document.documentElement.dataset.hydrated = '';
	});
</script>

<svelte:head>
	<meta property="og:site_name" content="Koenami" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ja_JP" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
