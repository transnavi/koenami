---
type: concept
title: "Automatic scoring of voice gender and femininity"
aliases: ["datasets", "self-supervised-representations", "speaker-identity"]
---

# Automatic scoring of voice gender and femininity

Models that output a continuous femininity/masculinity estimate, the datasets behind them, and what they can and cannot validate.

## What is known
- Voice Passing: a calibrated VFP from binary classifiers on windows, better than F0- or VTL-based models, on 41 French speakers and 57 listeners; style and age affect it [[doukhan2024]].
- Extreme-random-forest scores correlate with human masculinity/femininity ratings up to r = .63 (female) and .77 (male) at 7 s of speech [[chen2021]]; a later acoustic characterisation with a machine system [[chen2023]] (abstract unread).
- Gender classifiers are highly sensitive to voice modification and speaker verification fails as modification grows; texture should be modelled as pitch, resonance and weight [[netzorg2024]]; DSFD gives controlled teacher speech with EGG [[netzorg2025]].
- Self-supervised representations beat classical features for within-speaker impression shifts; multimodal LLMs were unreliable [[fujita2026]].
- Style-tag datasets: ParaSpeechCaps (59 tags, English) [[diwan2025]]; Coco-Nut (Japanese free-text) [[watanabe2023]]; JVS [[takamichi2019]].

## Contested or unclear
- No model in this vault is calibrated on Japanese listeners; Koenami's WavLM-based 聴こえ方 needs a Japanese listening study (method page).

## Related
[[gender-perception]] · [[voice-impressions]] · [[japanese-voice]]
