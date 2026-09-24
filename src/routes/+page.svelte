<script lang="ts">
	import Studio from '$lib/studio/components/Studio.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own prerendered head markup -->
	{@html data.head}
</svelte:head>

<Studio main={data.main} body={data.body} />
