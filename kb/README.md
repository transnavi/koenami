# kb — knowledge network on gendered voice

Everything the tutorial and the method page say should trace back to a note here. The vault holds one note per **source**, one per **concept**, and short notes for **tools** and **communities**; `index.md` is the map. Open the folder as an Obsidian vault; links are `[[wikilinks]]` by file name.

## Conventions

- `sources/<key>.md` — one published work, dataset, tool paper or community document. `<key>` is `firstauthorYEAR` (`leung2018`), or a short slug for unauthored pages (`mtfwiki-voice`). Frontmatter carries the bibliographic fields and how the record was verified; the body carries **what the source says**, each claim as a bullet, and **how it bears on voice training**. Claims come from the abstract or the full text as read; a claim taken from a secondary source says so.
- `concepts/<slug>.md` — one idea (F0, formant spacing, vocal weight, listener gender perception, …): a definition, what is known with `[[source]]` after every statement, what is contested, and open questions. No claim without a link.
- `tools/` and `communities/` — software and community resources, with what they measure or teach and their limits.
- Grades: `evidence: high | medium | low | community` in source frontmatter — high for meta-analyses and reviews, medium for controlled studies, low for theses, single-speaker or unvalidated work, community for practice guides and forums. A grade describes the source, never the claim's importance.
- Every source is verified before it is cited: `verified:` names the check (`doi.org content negotiation`, `pubmed abstract`, `openalex`, `page fetched <date>`). If a work could not be verified it does not get a note.
- Japanese and Chinese sources keep their titles in the original script; add a romanised or translated title in `title_en`.

## Template — source

```markdown
---
type: source
key: leung2018
title: "Voice, articulation, and prosody contribute to listener perceptions of speaker gender: a systematic review and meta-analysis"
authors: [Leung Y, Oates J, Chan SP]
year: 2018
venue: Journal of Speech, Language, and Hearing Research 61(2) 266–297
doi: 10.1044/2017_JSLHR-S-17-0067
url: https://doi.org/10.1044/2017_JSLHR-S-17-0067
language: en
kind: meta-analysis
evidence: high
verified: doi.org content negotiation 2026-09-17; pubmed abstract
topics: ["[[gender-perception]]", "[[fundamental-frequency]]", "[[formants]]", "[[intonation]]"]
---

## What it says
- (each claim, with where in the source it comes from)

## Bearing on voice training
- …

## Notes
- limitations, population, language of the speech studied
```

## Template — concept

```markdown
---
type: concept
title: Formant spacing (ΔF)
aliases: [響き, resonance, vocal tract length]
---

Definition …

## What is known
- statement [[source]]

## Contested or unclear
- …

## Open questions
- …

## Related
[[…]]
```
