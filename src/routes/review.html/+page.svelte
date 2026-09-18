<script lang="ts">
	import '$lib/studio/studio.css';
	import '$lib/studio/review.css';
	import { mountReview } from '$lib/review';
	import { onMount } from 'svelte';

	let { data } = $props();
	onMount(mountReview);
</script>

<svelte:head>
	{@html data.head}
</svelte:head>

{@html data.body}
