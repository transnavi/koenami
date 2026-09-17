---
type: tutorial
title: "4 · Reading Koenami's numbers"
---

# 4 · Reading Koenami's numbers

Each of the app's measures is a stand-in for something in the research. This page says what each one is, what the literature says about that thing, and where the stand-in breaks down. Definitions come from the app's method page [[koenami-method]].

## 高さ — median F0

What it is: the median fundamental frequency of voiced frames, by Praat's autocorrelation method, searched between 65 and 500 Hz [[koenami-method]].

What it stands for: the single strongest cue to perceived gender, about 42% of the variance across studies [[leung2018]]. For English, men's voices are heard as male until about 165 Hz and 145–165 Hz is the band where other cues decide [[gelfer2013]]; there is no sharp threshold once tract length and tilt vary too [[neuhaus2026]].

Where it breaks: a median hides the range. Trans women heard as female had a higher upper limit of speaking F0, not only a higher mean [[gelfer2000]]. Japanese norms are higher than Dutch for cultural reasons [[vanbezooijen1995]], and attractiveness ratings by Japanese listeners fall above roughly 280–290 Hz [[tanaka2022]]. See [[fundamental-frequency]].

## 響き — formant spacing

What it is: per frame, the mean of F1/0.5, F2/1.5, F3/2.5 and F4/3.5, averaged over frames where formants could be measured; a ΔF-type measure that the page says also moves with vowel and mouth shape [[koenami-method]].

What it stands for: the apparent length of the vocal tract, which shifts sex and gender judgements on its own even where F0 gives nothing away [[cartei2013]], predicts perceived gender more strongly than pitch in a teacher's controlled recordings [[netzorg2025]], and rises with resonance training [[carew2007]] [[sodersten2026]].

Where it breaks: formants are vowel-specific and vowel tables drift between decades [[hillenbrand1995]], so a whole-utterance average depends on what was said. Compare the same sentence. Formant tracking also fails on breathy or high-pitched frames, and the page's own caveat about vowels applies [[koenami-method]]. See [[formants]].

## 質感 — HNR

What it is: the median harmonics-to-noise ratio by Praat's cross-correlation method [[koenami-method]].

What it stands for: periodicity against noise, in other words how clean the phonation is. The page states it is affected by breath, hoarseness and recording noise and is not a direct measure of vocal weight [[koenami-method]].

Where it breaks: noise did not shift gender judgements in morphing [[skuk2014]], and breathiness had mixed results across studies [[leung2018]]. A low value can mean a breathy style, a tired voice or a bad microphone. Vocal weight in the community's sense is closer to closed quotient and to the harmonic balance H1–H2 [[herbst2020]] [[garellek2013]], which this number does not measure. See [[voice-quality]] and [[vocal-weight]].

## 明るさ — high-band energy ratio

What it is: energy in 1–4 kHz relative to 0.1–1 kHz, in dB; the page says it depends on vowel, phonation, microphone and processing [[koenami-method]].

What it stands for: spectral slope, which the source sets along with F0 [[bozeman2022]]; a breathier (steeper) tilt helps a female judgement when the implied tract is already short [[neuhaus2026]], and some trained trans women shift their harmonic balance [[sodersten2026]]. A brighter voice can also come from a shorter tract, since formants rise and carry energy upward [[fant1960]].

Where it breaks: the microphone and the room change it as much as the voice does. Use it to compare recordings made the same way. See [[voice-quality]].

## 抑揚 — F0 span in semitones

What it is: the span between the 10th and 90th percentiles of F0, in semitones; per-time points use the preceding 1.5 s; the page asks users to compare the same sentence because spans of different lengths are not comparable [[koenami-method]].

What it stands for: intonation, which contributes to gender perception in the meta-analysis [[leung2018]] and has its own clinical literature for trans speakers [[hancock2014]].

Where it breaks: in Japanese the span also carries pitch accent, phrase-final movement and emotion, and the page states that a larger span is not uniformly feminine [[koenami-method]]. See [[intonation]].

## 滑舌, 話す速さ and the review scales

滑舌 (articulatory clarity) is a listener-rated scale from the sample review, not an acoustic measure; articulation contributes to gender perception [[leung2018]]. Speaking rate is counted from the transcript in mora, characters, syllables or words and is not comparable across languages [[koenami-method]]. Speech rate predicted vocal naturalness ratings, not gender, in one study [[hardy2020]]. See [[articulation]].

## 声の判定 — the verdict

What it is: a projection of the five measures on a linear-discriminant axis fitted to the labelled sample speakers, scaled so that the masculine samples' median reads 25 and the feminine samples' 75; 65 and above is labelled 女性的な声, 35 and below 男性的な声. The page states it is not calibrated against listener ratings and that the sample distribution is not a population norm [[koenami-method]].

What it stands for: the machine-scoring literature, where random forests reach correlations of about 0.6–0.8 with human ratings [[chen2021]] and calibrated classifiers predict a continuous femininity percentage [[doukhan2024]].

Where it breaks: it knows nothing about naturalness, which acoustic measures did not predict [[netzorg2025]], and nothing about how you hear yourself, which correlates only weakly with listeners anyway [[quinn2021]]. See [[machine-gender-scoring]].

## The reference bands

Each band is the middle 80% of the chosen reference group's sample speakers [[koenami-method]]. They show where the samples fall, not where anyone should be; Koenami's sample is a corpus selection, not a population norm [[sex-differences]].

## Where to go next

[[05-practice-plan]]; and [[tools]] for what other software measures.
