---
type: source
key: voicelab
kind: tool
title: "VoiceLab: Software for Fully Reproducible Automated Voice Analysis"
url: https://github.com/Voice-Lab/VoiceLab
language: en
evidence: community
verified: page fetched 2026-09-17 (GitHub README raw content, Voice-Lab/VoiceLab)
topics: ["[[tools]]", "[[fundamental-frequency]]", "[[formants]]", "[[voice-quality]]"]
---

## What it offers
- Open-source (MIT-licensed) Python voice-analysis application, version 2.0.0 at the time of fetch, installable via `pip install voicelab` (Python 3.9-3.11) or standalone builds for Windows/macOS/Ubuntu.
- README's own description: "Voice Lab is an automated voice analysis software. What this software does is allow you to measure, manipulate, and visualize many voices at once, without messing with analysis parameters. You can also save all of your data, analysis parameters, manipulated voices, and full colour spectrograms and power spectra, with the press of one button."
- Citable via two publications listed in the README: Feinberg, D. (2022), "VoiceLab: Software for Fully Reproducible Automated Voice Analysis," Proc. Interspeech 2022, 351-355; and Feinberg, D. R., & Cook, O. (2020), "VoiceLab: Automated Reproducible Acoustic Analysis," PsyArXiv (preprint).

## What it measures/teaches
- Batch acoustic measurement and manipulation across many voice files at once, plus visualization (full-colour spectrograms, power spectra, LPC spectra viewport).
- Version 2.0 changelog in the README lists: an Alpha ratio measure (low-frequency to high-frequency energy ratio), pitch-corrected RMS energy and pitch-corrected Equivalent Continuous Sound Level (Leq) — both explicitly reimplemented after the README documents a bug in the "Voice Sauce" source algorithm it originally borrowed (Voice Sauce computed total energy per pitch-dependent frame rather than true RMS, so was not pitch-independent; VoiceLab's README states this was fixed and the corrected values are "much closer to those given by Praat now, but are different... because of the pitch-dependent frame length").

## Limits
- Positioned as a research/analysis tool for batch, reproducible acoustic measurement — not a training or coaching app, and not specific to gendered voice or voice feminization.
- The README documents that its own energy/RMS calculation had a known bug affecting all users through earlier versions; any published work using the earlier algorithm's Energy values should be treated with that caveat per the maintainer's own note.
