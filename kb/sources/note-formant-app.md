---
type: source
key: note-formant-app
title: フォルマントを使った声判定アプリについて
title_en: "On voice-judging apps that use formants"
authors: [きゃなる (note: kyanaru_vrc)]
year: 2026
venue: note.com, 2026-08-19
url: https://note.com/kyanaru_vrc/n/n449a69509a93
language: ja
kind: blog
evidence: community
verified: note.com API v3 note record fetched 2026-09-17 (title, author, publish_at, body)
topics: ["[[japanese-community]]", "[[formants]]", "[[machine-gender-scoring]]", "[[tools]]", "[[voice-impressions]]"]
---

# フォルマントを使った声判定アプリについて

A Japanese practitioner's critique of the formant-based voice-judging apps now circulating, including the ones used for 女声 practice. He writes from having built formant tools himself.

## What it says
- The phenomenon: 「海外で少し前からフォルマントを計測するアプリやサービスが出だしたこともあり、国内でもその流れを受けてかいくつかそのようなものを目ににする機会が増えてきました。」 — from displaying formants to verdicts like 「あなたの声は女性寄りです！」. He notes people also play with them: 「おじいさんみたいにしゃがれた声を出したのに、なぜか女性比率が高いと判定されることがあったり、逆にかわいい声を出したつもりが「男性寄りです」と言われることもある。」
- His own basis for criticising them: 「自分自身もいくつか下記のようなフォルマントを使ったプログラミングを試したことがあります（Webブラウザで動くフォルマント計測アプリ、Pythonで動くフォルマント解析ツール）」, and the conclusion: 「「信頼性のあるフォルマント計測」は簡単ではないということ。」
- The list of what makes formants move: 「母音の変化／声道の形／ノイズ／使用機材　マイクの特性・オーディオインターフェース／サンプリングレート／LPC（線形予測）の設定」, and the summary 「つまり、フォルマントは本来“安定した数値”ではない。」
- Why browser-based measurement is worse: 「Webブラウザは、音声解析向けではなく通話向けに最適化されているため、オーディオとしての品位はそれほど高くありません。ノイズ抑制／エコーキャンセル／帯域制限などが勝手に入り、高周波数帯域（F3・F4）が壊れやすい。結果として、F3-F4はかなりいい加減になりやすい。」 The app's own smoothing then decides the answer: 「アプリ側は「推測して丸める」しかなく、丸め方によって数値の傾向が変わる。つまり、アプリごとに判定結果が違うことがあっても当然といえる。」
- On what the apps compute: 「多くのアプリは、基礎ピッチとF1-F2による性差判定というシンプルな音韻言語学の手法を使っていると考えられます。しかし、人間の耳は F1〜F4のバランスで母音を聞き分けている。さらに、性差としてはの傾向は、声道長（喉〜口の長さ）で決まると言われるため、F1-F2だけでは反映しきれない。」 Who gets misjudged, in his list: 「小柄な男性／大柄な女性／子供声を出す大人／低音を出す女性」.
- His reconciliation of the confusing results: 「おじいさんみたいにしゃがれた声が女性比率が高いと判断されるのは基礎ピッチが高いと判別しているためと思われる。」 And his verdict on use: 「フォルマント判定アプリは、声をいじって遊ぶツールとしては楽しい。…ただし、科学的に正確な性差判定ツールではない」, with one exception: 「基礎ピッチに関してはフォルマントほど誤差は出にくいと思われるので女声の練習用として使うには有用ではないかと思います。」

## Bearing on voice training
- The Japanese-language version of the argument the vault's machine-scoring notes make from the research side: formant measurement is unstable, browser audio pipelines damage the upper formants, and F1–F2 alone cannot carry a gender verdict ([[machine-gender-scoring]], [[doukhan2024]], [[chen2021]]). His point that the formant set matters — 「人間の耳は F1〜F4のバランスで母音を聞き分けている」 — is the perception-side counterpart of why ΔF is defined across F1–F4 in [[formants]].
- His practical concession is worth carrying: use of F0 feedback is defensible for practice, use of a formant-based gender percentage is not. Compare the training use of formant biofeedback in [[kawitzky2020]], where the feedback was a single formant moved on demand under supervision rather than a verdict.

## Limits
- A personal technical blog post; the author states his programming experience but gives no measurements, no comparison of specific apps by name, and no cited literature. The claim that F3–F4 are damaged by browser audio processing is his reasoning from how browser voice pipelines behave, not a measurement he reports.
- Published 2026-08-19; no software versions or devices are specified.

## Related
[[formants]] · [[machine-gender-scoring]] · [[tools]] · [[japanese-community]]
