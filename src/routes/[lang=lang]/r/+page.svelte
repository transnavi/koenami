<script lang="ts">
	import '$lib/studio/studio.css';
	import { mountResult } from '$lib/result';
	import { onMount } from 'svelte';

	let { data } = $props();
	onMount(mountResult);
</script>

<svelte:head>
	{@html data.head}
</svelte:head>

{@html data.body}
