<script lang="ts">
	import '$lib/studio/studio.css';

	let { data } = $props();
</script>

<svelte:head>
	{@html data.head}
</svelte:head>

{@html data.body}
