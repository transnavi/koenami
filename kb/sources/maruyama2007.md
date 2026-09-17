---
type: source
key: maruyama2007
title: 話者認識技術に基づく知覚的女声度の自動推定
title_en: "Automatic femininity estimation of speech based on speaker recognition techniques"
authors: [丸山和孝]
year: 2007
venue: 東京大学大学院情報理工学系研究科電子情報学専攻 修士論文（UTokyo Repository hdl 2261/25842, 発行 2007-02-02、学位授与 2007-03）
url: https://repository.dl.itc.u-tokyo.ac.jp/records/1801
language: ja
kind: master's thesis
evidence: low
verified: UTokyo Repository record fetched 2026-09-17 (abstract, degree, department, dates); CiNii OpenSearch record 2026-09-17
topics: ["[[japanese-community]]", "[[machine-gender-scoring]]", "[[gender-perception]]", "[[fundamental-frequency]]", "[[japanese-voice]]", "[[tools]]"]
---

# 話者認識技術に基づく知覚的女声度の自動推定

A 2007 University of Tokyo master's thesis that built an automatic estimator of how female an MtF speaker's voice sounds — the Japanese antecedent of the gender-scoring tools now circulating in the community ([[note-formant-app]], [[acoustic-gender-space]]).

## What it says
- The estimator's target is defined perceptually and by listeners, not acoustically: 「知覚的女声度は、聴取実験により、第三者にとってMtFの音声に対してどの程度女声らしく聞こえるかという度合いでありMtFの音声に対してラベル付けした。」 Listeners rated the speech and the model was trained against their labels.
- The headline agreement figures: 「実際の知覚的女声度と計算機による予測値との相関係数は0.86となった。それに対応する人間同士の評価の相関係数は0.88であったことから、本論分で構築した知覚的女声度自動推定器は、ひとりの人間とみなせる程度の性能であるといえる。」 Model-vs-listener r = 0.86 against listener-vs-listener r = 0.88, and the conclusion drawn is that the estimator performs like one human rater.
- Method: built on speaker-recognition techniques, per the title and the English title the repository gives, "Automatic Femininity Estimation of Speech Based on Speaker Recognition Techniques".
- Deployment claim: 「この推定器にはインターフェースが実装され、臨床の場面で使用していただき、好評を得ている。」
- Keywords as indexed: 男女識別, 知覚的女声度, 話者認識, 性同一性障害.
- Filed under 電子情報学専攻; supervisor and other details were not on the repository record.

## Bearing on voice training
- The conceptual move worth noticing is the calibration: a gender score is only as meaningful as the listener agreement it reproduces, and this thesis reports both numbers. That is the check the community tool commentary asks for when it says formant-based verdicts are unstable and app-dependent [[note-formant-app]], and the research side of the same problem is in [[machine-gender-scoring]], [[chen2021]] and [[doukhan2024]].
- A Japanese estimator trained on Japanese MtF speech from around 2005–2006 is the closest Japanese analogue to the tools this vault documents; the two Japanese perception studies by the same research group ([[sakuraba2009]], [[imaizumi2003]]) come from the same line of work.

## Limits
- Low-grade: a master's thesis, cited from the repository's abstract only; the PDF (3.6 MB) was not read. Listener panel size, speech material, features and cross-validation are all unverified here.
- The 「臨床の場面で…好評を得ている」 line is the author's own report of informal clinical use, with no study attached.
- 2007 data and 2007 speech technology; the repository's own record was published 2011-08-08 for a 2007 degree.

## Related
[[machine-gender-scoring]] · [[gender-perception]] · [[japanese-voice]] · [[tools]]
