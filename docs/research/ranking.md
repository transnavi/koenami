# Ranking reference speakers for a take

How the studio's closest-to-you order turns distances into a ranking of reference speakers, and
whether that ranking follows a deliberate change of voice. It builds on
`jvs-similarity.md`, which chose the representation: the layer-3 timbre descriptor
(`perception.timbre`, descriptor `wavlm-l3-int8-v2`). Aggregate results are in
`ranking-library.json` (from `research_ranking.py`) and `ranking-voice-changes.json` (from
`research_voice_changes.py`); each records the sha256 of the script that wrote it.

## Data

- The shipped timbre index and the Japanese library: the five measures of every plotted clip,
  standardised the way the studio's `AcousticSpace` does it (one representative clip per speaker
  chosen as `representatives()` in `src/lib/score.ts` does, median centre, IQR / 1.349 scale with
  the same floors).
- JVS within-group speaker-similarity ratings (`speaker_similarity_{female,male}.csv`): 95 of the
  100 JVS speakers have non-parallel clips in the library and serve as queries.
- JVS modal, falsetto and whisper readings of `VOICEACTRESS100_001–005` (1,495 clips).
- The Versatile Voice Dataset: three speakers, the words "hit" and "key", up to 27 settings of
  pitch, resonance and weight (79 settings in all).

## Listener agreement and retrieval

Listener agreement: up to five non-parallel clips per JVS speaker each rank the other speakers of
the same group; per-query Spearman against the rating row, averaged per query speaker, with a
speaker bootstrap (2,000 draws). Retrieval: over the 150 Japanese speakers with at least four
clips, up to eight clips per speaker are held out in turn (961 queries) and the speaker's remaining
clips must beat every other speaker. Every reference speaker offers at most ten clips, drawn once
with a fixed seed, so a nearest-clip profile gets no extra chances.

| representation, aggregation | listener agreement | retrieval top-1 | MRR |
|---|---|---|---|
| timbre, speaker centroid | 0.268 [0.243, 0.292] | 88.7 % | 0.925 |
| timbre, nearest clip | 0.257 [0.235, 0.281] | 85.1 % | 0.903 |
| timbre, mean of three nearest | 0.264 [0.239, 0.287] | 90.1 % | 0.931 |
| five measures, speaker centroid | 0.203 [0.168, 0.237] | 26.4 % | 0.420 |
| five measures, nearest clip | 0.198 [0.165, 0.232] | 20.5 % | 0.366 |
| five measures, mean of three nearest | 0.208 [0.171, 0.243] | 24.0 % | 0.401 |

Paired differences under the same bootstrap: timbre over five measures +0.065 [+0.029, +0.098]
with centroids on both sides, +0.059 [+0.025, +0.090] with nearest clips on both. Nearest clip
against centroid: −0.011 [−0.019, −0.002] for timbre, −0.005 [−0.017, +0.007] for the five
measures. The representation carries the difference, and pooling moves little: on listener
agreement the centroid the studio uses is the best timbre option, and on retrieval the mean of
the three nearest clips is slightly ahead of it (90.1 % against 88.7 %).

## Blending the two distances

Each distance is z-scored across the candidate speakers of one query and the two are mixed with
weight *w* on timbre. The studio's own computation (`src/lib/similar.ts`) z-scores across every
speaker the index ranks for the language, synthetic voices included, with the timbre centroid of
each speaker's indexed clips and the five-measure centre of its plotted clips; the columns marked
"as computed by the studio" repeat that and only then keep the rated speakers.

| *w* on timbre | agreement, candidates only | agreement, as computed by the studio | retrieval top-1, as computed by the studio |
|---|---|---|---|
| 0 (five measures) | 0.203 | 0.205 | 27.1 % |
| 0.25 | 0.254 | 0.237 | 52.1 % |
| 0.50 | 0.287 | 0.275 | 75.8 % |
| **0.75** | **0.289** | **0.300 [0.272, 0.330]** | **87.7 %** |
| 1 (timbre) | 0.268 | 0.284 [0.259, 0.309] | 88.3 % |

As computed by the studio, *w* = 0.75 against timbre alone: +0.017 [+0.001, +0.031]. To check the
weight out of sample, it was chosen on a random half of the query speakers and scored on the
other half, 500 times: 0.75 was chosen 498 times, and the held-out gain over timbre alone had a
median of +0.018 (2.5–97.5 % of splits: +0.003 to +0.031), positive in 98.8 % of splits. At 0.75,
69 % of the top five other speakers stay the same as under timbre alone. The studio ships
*w* = 0.75.

## Deliberate voice changes

**JVS modal, falsetto and whisper.** For a query clip A–X (voice A, sentence X) the test is
d(A–X, A–Y) < d(A–X, B–X): the same voice on another sentence closer than the same sentence in
another voice. Coverage: timbre 1,478 of 1,495 clips, x-vector 1,477, five measures 1,025
(whisper mostly fails the voicing gate).

| pair of voices | timbre | x-vector | five measures |
|---|---|---|---|
| modal / falsetto | 99.2 % of 3,960 (ratio 3.62) | 86.9 % of 3,960 (2.93) | 97.3 % of 3,960 (2.87) |
| modal / whisper | 100 % of 3,830 (6.85) | 97.3 % of 3,824 (4.01) | 94.6 % of 168 (3.76) |
| falsetto / whisper | 100 % of 3,790 (7.85) | 88.1 % of 3,784 (2.11) | 95.8 % of 168 (3.25) |

The ratio is the median of d(other voice) / d(other sentence). As retrieval: among a speaker's
other clips, is the nearest one in the query's own voice? Counting only queries that have another
clip in their own voice, timbre alone gets all 1,478 right. On the 1,016 such queries where the
five measures are also available, timbre and the 0.75 blend get all of them, the 0.5 blend
99.8 % and the five measures 98.1 %.

**Versatile Voice Dataset.** Each setting becomes one clip, "hit" then "key" with a 0.3 s gap
after each, so the words never change within a speaker. Spearman between the distance of two of
one speaker's settings (ranked within the speaker) and how many steps apart they are:

| representation | pitch | resonance | weight |
|---|---|---|---|
| timbre | +0.39 | +0.40 | +0.26 |
| x-vector | +0.03 | +0.59 | +0.11 |
| five measures | +0.26 | +0.37 | +0.23 |

Per speaker (pitch / resonance / weight), timbre: 001 +0.16 / +0.67 / +0.04, 002 +0.38 / +0.27 /
+0.59, 003 +0.63 / +0.25 / +0.21; five measures: 001 +0.14 / +0.49 / +0.13, 002 +0.39 / +0.21 /
+0.41, 003 +0.27 / +0.38 / +0.16. The three speakers differ a lot, and nothing independent of
these distances says which dimension each of them changed most. For speakers 001 and 002 the two
representations peak on the same dimension (resonance, weight); for 003 timbre peaks on pitch and
the five measures on resonance. The x-vector follows resonance and hardly pitch, as an identity
embedding should.

## Limits

- The JVS ratings pair speakers only within the female group and within the male group, so none
  of the agreement figures covers voices between the two. The layer and pooling of the descriptor
  were chosen on the same ratings, and the blend weight on them too.
- The voice-change tests show that the representations separate deliberate changes from
  sentence changes; they do not show that the distances match how listeners hear those changes.
  The configuration labels are the speakers' instructions: the Versatile Voice Dataset's authors
  report that speakers interpreted them differently, and no listener checked the contrasts here.
- The Versatile Voice Dataset has three speakers and two words; its audio carries no stated
  licence, so `research_voice_changes.py --fetch-vvd` keeps a local copy under the ignored
  `research/` for analysis only.
- All speech is read Japanese (JVS) or English words (VVD), recorded in studio conditions.

## Sources

- Takamichi, S. et al., JVS corpus: README and similarity CSVs in `jvs_ver1.zip`,
  https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus
- Netzorg, R. et al. 2024, Speech After Gender: A Trans-Feminine Perspective on Next Steps for
  Speech Science and Technology (arXiv 2407.07235); the Versatile Voice Dataset audio at
  https://github.com/Berkeley-Speech-Group/VersatileVoiceDataset (no licence stated in the
  repository, read 2026-09-24).
- Schütt, H. et al. 2023, eLife 82566, on resampling speakers when bootstrapping comparisons.
