<script lang="ts">
	import '$lib/studio/studio.css';
	import { onMount } from 'svelte';
	import { mountResult } from '$lib/result';

	onMount(mountResult);
</script>

<svelte:head>
	<title>Koenami · 声の判定</title>
	<meta name="description" content="Koenamiで測った声の判定。女性的な声・男性的な声・中間の見本の中で、この声がどこにあるか。" />
	<meta name="robots" content="noindex" />
	<meta property="og:site_name" content="Koenami" />
	<meta property="og:title" content="Koenami · 声の判定" />
	<meta property="og:description" content="女性的な声・男性的な声の見本の中で、この声がどこにあるか。" />
	<meta property="og:type" content="website" />
	<meta property="og:locale" content="ja_JP" />
	<meta property="og:url" content="https://koe.transnavi.jp/r" />
	<meta property="og:image" content="https://koe.transnavi.jp/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Koenami · 声の判定" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Koenami · 声の判定" />
	<meta name="twitter:description" content="女性的な声・男性的な声の見本の中で、この声がどこにあるか。" />
	<meta name="twitter:image" content="https://koe.transnavi.jp/og-image.png" />
</svelte:head>

<header class="method-header"><a class="brand" href="/">← Koenami</a><nav class="method-nav"><a href="/guide.html">使い方</a><a href="/tutorial.html">声のしくみ</a><a href="/method.html">測定方法と出典</a></nav></header>
<main class="method result-page">
<p class="result-eyebrow">この声の判定</p>
<h1 id="result-verdict" class="result-verdict">読み込んでいます…</h1>
<p id="result-score" class="result-score" hidden><strong>—</strong><span></span></p>
<figure class="result-card"><img id="result-image" alt="" hidden><figcaption id="result-status" role="status"></figcaption></figure>
<div id="result-actions" class="result-actions" hidden>
 <a id="result-try" class="result-primary" href="/ja/">自分の声も測る</a>
 <div class="result-share" role="group" aria-label="結果を共有"><span id="result-intents"></span><button id="result-copy" type="button">リンクをコピー</button><button id="result-save" type="button">画像を保存</button></div>
</div>
<section id="result-metrics" hidden>
<h2>5つの指標</h2>
<p>自分の値と、見本の話者の中央80%（女性的な声・男性的な声）を並べています。</p>
<table><thead><tr><th>指標</th><th>この声</th><th>女性的な声の見本</th><th>男性的な声の見本</th></tr></thead><tbody id="result-metric-rows"></tbody></table>
</section>
<section id="result-notes" hidden>
<h2>この判定の読み方</h2>
<p>数値は、見本の話者から求めた「男女差」の方向（女性的な声と男性的な声が最も離れる向き）に、この声の5つの指標を投影した位置です。男性的な見本の中央値と女性的な見本の中央値のちょうど中間を0とし、男性的な見本の中央値を−25、女性的な見本の中央値を+25とする直線の目盛りで、−50〜+50の範囲で表示します。+15以上を「女性的な声」、−15以下を「男性的な声」、その間を「中間的な声」と呼んでいます。</p><p>どちらの向きも目標になります。女声を目指すなら＋の方向、男声を目指すなら−の方向、性別の印象を薄くしたい・中性的な声を目指すなら0に近づくことが目安です。</p>
<ul>
<li>聞き手がどう感じるかを測ったものではなく、5つの音響指標の位置です。同じ人でも文章、話し方、マイク、周囲の音で変わります。</li>
<li>見本の分布は一般人口の標準値ではありません。言語ごとに見本が違うため、言語をまたいで数値を比べることはできません。</li>
<li>短い録音や雑音の多い録音では、響きや抑揚の値が安定しません。同じ文をいくつか録音して見比べてください。</li>
</ul>
<p class="small">判定の計算方法は<a href="/method.html">測定方法と出典</a>にあります。判定の方式を変えたときは、この番号（<span id="result-version">v1</span>）が変わります。</p>
</section>
</main>
