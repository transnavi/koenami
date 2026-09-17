<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<meta property="og:site_name" content="Koenami" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ja_JP" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
