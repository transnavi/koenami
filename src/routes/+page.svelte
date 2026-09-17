<script lang="ts">
	const title = 'Koenami · 女声・男声のボイトレツール';
	const description =
		'両声類を目指す方、トランスジェンダーの方、女声・男声を出してみたい方向けの無料ボイトレツール。見本の声を真似して録音すると、自分の声が空間上に映り、近づきたい声との距離が見えます。リアルタイム測定にも対応。';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://koe.transnavi.jp/" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content="https://koe.transnavi.jp/" />
	<meta property="og:image" content="https://koe.transnavi.jp/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={title} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content="https://koe.transnavi.jp/og-image.png" />
</svelte:head>

<main class="min-h-dvh bg-bg text-ink"></main>
