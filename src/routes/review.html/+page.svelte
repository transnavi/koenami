<script lang="ts">
	import '$lib/studio/studio.css';
	import '$lib/studio/review.css';
	import { onMount } from 'svelte';
	import { mountReview } from '$lib/review';

	onMount(mountReview);
</script>

<svelte:head>
	<title>Koenami · 聴取レビュー</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="review">
<svg class="sprite" aria-hidden="true" style="display:none"><defs><symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></symbol><symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></symbol><symbol id="i-moon" viewBox="0 0 24 24"><path d="M20.7 13.2A9 9 0 0 1 10.8 3.3 9 9 0 1 0 20.7 13.2Z"/></symbol><symbol id="i-list" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></symbol></defs></svg>
<div class="review-head"><h1>聴取レビュー</h1><a class="pairs-link" href="./pairs.html">比較へ</a><koe-select id="lang" icon="i-globe" aria-label="言語"><option value="ja">日本語</option><option value="zh-CN">普通话</option><option value="en">English</option><option value="ko">한국어</option></koe-select><span class="segment mode" id="mode"><button type="button" data-mode="new" aria-pressed="true">新規</button><button type="button" data-mode="update" aria-pressed="false">追加項目</button></span><span class="segment mode" id="pass"><button type="button" data-pass="all" aria-pressed="true">全部</button><button type="button" data-pass="性別・発音">性別・自然さ</button><button type="button" data-pass="声質">声質・話し方</button><button type="button" data-pass="印象">印象</button></span><span class="progress" id="progress"></span><button id="theme-button" class="icon-button" title="明暗を切り替え" aria-label="明暗を切り替え"><svg aria-hidden="true"><use href="#i-moon"></use></svg></button></div>
<section class="card" id="card" hidden>
 <div class="speaker"><button id="prev-speaker" class="icon-button" title="前の話者" aria-label="前の話者"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg></button><strong id="display"></strong><span id="speaker-meta"></span><button id="jump" class="list-button" type="button"><svg aria-hidden="true"><use href="#i-list"></use></svg>一覧<kbd>L</kbd></button></div>
 <div class="clip"><button class="play" id="play" aria-pressed="false" aria-label="再生" title="Space：再生／一時停止　R：最初から">▶</button><div class="text" id="text"></div><nav><button id="prev-clip" aria-label="前の音声">‹</button><button id="next-clip" aria-label="次の音声">›</button></nav></div>
 <div class="anchors" id="anchors" hidden><span class="group">基準</span></div>
 <div id="scales"></div>
 <div class="flags" id="quality-flags"><span class="group">問題</span></div>
 <input class="note" id="note" placeholder="メモ">
 <div class="actions"><span class="status" id="status"></span><button id="skip">スキップ<kbd>S</kbd></button><button class="primary" id="save">保存して次へ<kbd>Enter</kbd></button></div>
</section>
<p class="done" id="done" hidden></p>
<div class="log" id="log"></div>
<dialog id="list-dialog"><div class="dialog-heading"><h2>話者一覧 <span id="list-count" class="small"></span></h2><button class="icon-button" data-close aria-label="閉じる">×</button></div><input id="list-filter" class="note" placeholder="番号や文で絞り込む" autocomplete="off"><div id="list-items"></div></dialog>
</main>
