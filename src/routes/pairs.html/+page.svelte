<script lang="ts">
	import '$lib/studio/studio.css';
	import '$lib/studio/pairs.css';
	import { mountPairs } from '$lib/pairs';
	import { onMount } from 'svelte';

	let { data } = $props();
	onMount(mountPairs);
</script>

<svelte:head>
	{@html data.head}
</svelte:head>

{@html data.body}
