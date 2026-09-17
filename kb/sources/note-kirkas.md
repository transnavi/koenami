---
type: source
key: note-kirkas
title: 女声を練習するためのツールを作りました
title_en: "I made a tool for practising a female voice (Kirkas)"
authors: [ゆず｜kirkas (note: n321)]
year: 2026
venue: note.com, 2026-08-02
url: https://note.com/n321/n/n465110175100
language: ja
kind: blog
evidence: community
verified: note.com API v3 note record fetched 2026-09-17 (title, author, publish_at, body)
topics: ["[[japanese-community]]", "[[tools]]", "[[community-training]]", "[[voice-feminization-therapy]]", "[[intonation]]"]
---

# 女声を練習するためのツールを作りました

A Japanese web app for 女声 practice, written up by its maker on note. It is the Japanese counterpart to the English-language practice tools already in the vault, and unusual in stating its design constraint as avoiding outing.

## What it says
- Who built it and why: 「4年前に自認は男性ではないと気づいてから、いろいろとありまして、普段は男性として生活しながら、家でメイクを練習したり、洋服を着たりしています。いつかは体も変えることを夢に見るようになりました。ただ、その時が本当に来たとして、確実に悩むことがわかっているのが、声のこと。女性らしい声は一朝一夕では身につきません。」 He describes trying to follow YouTube practice videos and not keeping it up, and building the app instead.
- The three things it does, in the author's numbering: listen to model voices (「AIでできる限り自然な声を作り、それを聞きながら練習できると、イントネーションが身につきます」); record and compare immediately in-app (「アプリ上でお手本と録音をすぐに切り替えられれば、練習の効率が上がります。録音が外部に保存されないのも大切なポイントです」); and a large bank of everyday example sentences (「できる限り日常に寄せて、いろんなシチュエーションの何気ない会話で練習ができると、実際の生活と重ね合わせることができ、続けやすくなる」).
- The concealment design, which is the note's distinctive part: 「MTF系のアプリはアイコンやメインカラーがピンクやレインボーになっていることがあります。自分のようにCOしていない人や、LGBTではないが女声の練習をしたい人にとってはリスクに感じてしまう点です。このアプリはアイコンやアプリ内のカラー、文章には関連する文言は含めていません。」 He adds the limit of that: 「＊実際に練習風景や声を聞かれたらバレるので、あくまで「バレにくい」だけです。」
- On ads, the same reasoning applied to money: 「本当は広告を掲載するか迷いましたが、使っていただいた方に意図せずLGBTや女性向けの広告が出てアウティングになったら最悪だなと思ってやめました。」 The app is free and ad-free, donation-supported.
- The model voices are synthetic: 「AIの合成音声であり、実在の人物の声ではありません。全てAI音声生成サイトのプリセット（あらかじめ設定されていた声）を使っています。」 Five model voices at the time of writing, chosen for variety; the engine was changed from VOICEVOX to another AI voice service because of naturalness.
- On the emotional setting for this practice, stated plainly: 「私にとって女声の練習は孤独で苦しいです。自分のキモい声と向き合いながら、本当にできるようになるかわからない苦痛と戦い続けているし、いつも諦めそうになります。」
- Practical details: a web app (kirkas.app) rather than an app-store release, because 「アプリストアは実名じゃないと登録できず、ハードルが高い」; optional practice-record logging for motivation; a session timer to discourage over-practice; no account, nothing retained after the page closes.

## Bearing on voice training
- Adds a Japanese practice tool to the vault's tools set ([[tools]], [[praat]], [[acoustic-gender-space]]), and unlike those it is built for imitation practice — model voice plus immediate self-recording — rather than measurement.
- Its imitation target is イントネーション as much as pitch, which matches where the evidence puts the remaining variance ([[leung2018]], [[intonation]]) and where Japanese guides place early effort ([[brushvoice-joseigoe]]).
- The concealment and advertising constraints are the practical face of the stigma the vault's outcome literature measures ([[parchem2025]]).

## Limits
- The author's own account of his tool; no usage data, no outcome data and no acoustic evaluation of the model voices. The app itself was not used for this note.
- The model voices are AI presets, and the author states he cannot name the generation service for terms-of-service reasons, so they cannot be checked.

## Related
[[tools]] · [[japanese-community]] · [[community-training]] · [[intonation]]
