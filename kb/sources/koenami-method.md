---
type: source
key: koenami-method
title: "Koenami — 測定方法と出典 (method page)"
title_en: "Koenami — measurement method and sources"
authors: [transnavi]
year: 2026
venue: koe.transnavi.jp
url: https://koe.transnavi.jp/method.html
language: ja
kind: documentation
evidence: community
verified: "repository file web/method.html read 2026-09-17; live page https://koe.transnavi.jp/method.html"
topics: ["[[tools]]", "[[fundamental-frequency]]", "[[formants]]", "[[voice-quality]]", "[[intonation]]", "[[machine-gender-scoring]]"]
---

## What it says
- 高さ: the median F0 of voiced frames, Praat autocorrelation, search range 65–500 Hz.
- 響き: per frame the mean of F1/0.5, F2/1.5, F3/2.5, F4/3.5, averaged over measurable frames (a ΔF-type spacing measure); the page says it also changes with vowel and mouth shape.
- 質感: median HNR by Praat's cross-correlation method; the page states it is affected by breath, hoarseness and recording noise and "is not a direct measure of vocal weight" (声の重さを直接表す指標ではありません).
- 明るさ: the energy ratio of 1,000–4,000 Hz to 100–1,000 Hz in dB; depends on vowel, phonation, microphone and processing.
- 抑揚: the 10th–90th percentile span of F0 in semitones; per-time points use the preceding 1.5 s; the page asks users to compare the same sentence because spans of different length are not comparable.
- 高さの標準偏差: shown in Hz and semitones in the report; the page notes it also reflects Japanese pitch accent, Chinese tone, phrase ends and emotion, and that a larger span is not uniformly feminine.
- 滑舌 (articulatory clarity) is a listening-review scale, not an acoustic measure; the page cites Leung et al. 2018 for articulation as a perceptual factor and ParaSpeechCaps' crisp/slurred/stammering tags.
- 話す速さ: from the transcript, counted in mora (Japanese, via Sudachi readings), characters (Chinese), Hangul syllables (Korean) or words (English); not comparable across languages.
- 声の判定 (the shared verdict): a projection of the five measures on a Fisher linear-discriminant axis fitted to labelled sample speakers, scaled so that the masculine samples' median is 25 and the feminine samples' median is 75; 65 and above is called 女性的な声, 35 and below 男性的な声. The page states it is not calibrated against listener ratings and that the sample distribution is not a population norm.
- Reference bands are the middle 80% of the chosen reference group's speakers.

## Bearing on voice training
- Defines exactly what each Koenami number is, so tutorial claims about "高さ" or "響き" can be matched to the literature's F0 and ΔF.

## Notes
- First-party documentation of the app; a community-grade source for the app's own definitions, not evidence about voices.
