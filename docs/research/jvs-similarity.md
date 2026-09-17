# JVS listener-similarity benchmark

Which representation of a voice orders speakers the way Japanese listeners
do, and does it still register a deliberate change in phonation? This is the
record behind the layer-3 timbre descriptor (`perception.timbre`), the
expanded acoustic set, and the decision to ship untrained distances.
Aggregate numbers are in `jvs-similarity-results.json`, assembled by
`assemble_jvs_results.py` from the scripts' outputs; the scripts are at the
repository root; generated caches live in the ignored `research/`.

Scripts: `benchmark_jvs_similarity.py` (extraction, raw-distance scoring),
`probe_jvs_similarity.py` (nested supervised probes),
`extract_expanded_acoustics.py` (expanded acoustic vector),
`research_jvs_deploy_check.py` (the deployed pipeline and its alternatives),
`research_jvs_halving_audit.py` (pitch-tracking audit). The results file
records the commit, model revisions and measurement versions of the run.

## Data

- Ratings: `jvs_ver1/speaker_similarity_{female,male}.csv` (CC BY-SA 4.0
  tags). 51 female and 49 male speakers; diagonal 3, perfectly symmetric;
  2,451 within-group pair means. The JVS description gives ten listeners per
  pair on a −3..+3 scale. Individual judgements are not distributed, so the
  listener-reliability ceiling is unknown.
- Clips: the 5,000 prepared JVS recordings (20 `parallel100` sentences and 30
  `nonpara30` sentences per speaker, 16 kHz), plus from the archive the five
  sentences `VOICEACTRESS100_001–005` shared by `parallel100`, `whisper10` and
  `falset10` (500 modal, 500 whisper, 495 falsetto).
- Representations, cached in `cache.npz`: the app's acoustic five (f0 in
  semitones, ΔF, HNR, spectral balance, pitch span); the deployed
  `microsoft/wavlm-base-plus-sv` x-vector (revision 1bfd64e); mean and SD
  pooled hidden states of every layer (0–12) of that checkpoint, and of
  `microsoft/wavlm-base-plus` (revision 4c66d48). Encoder input is a centre
  crop of at most 8 s, one clip per pass under fp16 autocast. Padding a
  batch is not an option: WavLM Base+ normalises its first convolution over
  the whole time axis, and a 5 s clip zero-padded to 8 s moves its layer-3
  mean to cosine 0.964 of the unpadded one (layer 12: 0.9989, x-vector:
  0.997; measured by the `checks` stage and recorded under `models.checks`).
  The `wavlm-base-plus` rows are cached but omitted from the tables: with a
  weight difference of 0.0 they are identical by construction.
  The prepared clips' acoustic five are the values the library was built
  with (the Rust engine); the archive clips are measured by `acoustics.py`.
  `measure/parity.py` puts the two within rounding of each other.
- The two checkpoints share their encoder weights (largest difference
  0.0, compared key by key and recorded under `models.checks`).
  `wavlm-base-plus-sv` trained only its x-vector head, which reads a learned
  softmax mix of all 13 layers (weights 0.151, 0.081, 0.085, 0.101, 0.170,
  0.133, 0.057, 0.076, 0.039, 0.025, 0.030, 0.026, 0.026 for layers 0–12).

## Raw distances against the ratings

Spearman over unique within-group pairs; 95 % interval from a speaker
bootstrap of 500 draws (1,000 for the paired differences and the deployment
rows) in which duplicated speakers stay and pairs of the same original
speaker are dropped (after Schütt et al. 2023); anchor = per-speaker ranking
of the others. Cosine for neural vectors, Euclid on robust-scaled features
for the acoustic five. Centroids over the 20 parallel sentences. Every layer is in the results file; the full mean-pooled curve
(female/male) is L0 +0.22/+0.31, L1 +0.31/+0.38, L2 +0.40/+0.38, L3 +0.43/+0.36, L4 +0.42/+0.31, L5 +0.39/+0.28, L6 +0.33/+0.26, L7 +0.27/+0.23, L8 +0.22/+0.22, L9 +0.20/+0.21, L10 +0.20/+0.22, L11 +0.16/+0.20, L12 +0.18/+0.21.

| representation | female ρ | male ρ | anchor p10 f / m |
|---|---|---|---|
| acoustic five | +0.26 [0.13, 0.36] | +0.26 [0.13, 0.37] | +0.04 / +0.03 |
| x-vector | +0.28 [0.14, 0.42] | +0.33 [0.19, 0.44] | +0.05 / +0.15 |
| WavLM layer 1 mean | +0.31 [0.20, 0.41] | +0.38 [0.26, 0.48] | +0.13 / +0.12 |
| WavLM layer 2 mean | +0.40 [0.27, 0.50] | +0.38 [0.27, 0.47] | +0.20 / +0.12 |
| WavLM layer 3 mean | +0.43 [0.32, 0.53] | +0.36 [0.24, 0.45] | +0.21 / +0.10 |
| WavLM layer 4 mean | +0.42 [0.30, 0.53] | +0.31 [0.17, 0.43] | +0.23 / +0.03 |
| WavLM layer 6 mean | +0.33 [0.20, 0.44] | +0.26 [0.13, 0.37] | +0.10 / -0.02 |
| WavLM layer 9 mean | +0.20 [0.07, 0.31] | +0.21 [0.09, 0.33] | +0.02 / -0.13 |
| WavLM layer 12 mean | +0.18 [0.08, 0.28] | +0.21 [0.09, 0.34] | -0.01 / -0.04 |
| WavLM layer 3 mean+SD | +0.35 [0.24, 0.45] | +0.33 [0.21, 0.44] | +0.18 / +0.09 |

Mean+SD pooling was below mean pooling at layers 1–12 and marginally above
it at layer 0 (best layer average
0.36 against 0.39).
Paired difference to the x-vector under shared speaker bootstraps (1,000
draws, seed 0): layer 3 female +0.15 [+0.03, +0.26], male +0.03 [-0.10, +0.14]; layer 2
female +0.12 [+0.01, +0.23], male +0.05 [-0.07, +0.16]; acoustic five female -0.03 [-0.17, +0.13], male
-0.07 [-0.23, +0.09].

Aggregation matters. The single-clip rows here are clip against clip on
both sides, unlike the probe and deployment tables, where a single clip is
ranked against reference centroids. From a single parallel clip (female / male): layer 2
+0.29 / +0.25, layer 3 +0.27 / +0.23, x-vector +0.22 / +0.28,
acoustic five +0.17 / +0.19. From a single non-parallel clip the x-vector is
best (+0.23 / +0.26; layer 2 +0.21 / +0.21, layer 3 +0.20 / +0.17, no layer above
+0.24). Centroids of the 30 non-parallel sentences: layer 3 +0.35 / +0.34, layer 2
+0.32 / +0.35, x-vector +0.29 / +0.31, acoustic five +0.24 / +0.29.

## Same-speaker sensitivity (matched sentences, median distance ratios)

| representation | falsetto ÷ other same-gender speaker, same text | whisper ÷ same | falsetto ÷ same speaker, other text |
|---|---|---|---|
| acoustic five | 1.77 | 2.81 | 3.30 |
| x-vector | 1.19 | 1.41 | 4.34 |
| WavLM layer 2 mean | 2.04 | 3.77 | 3.39 |
| WavLM layer 3 mean | 1.94 | 3.41 | 2.63 |
| WavLM layer 9 mean | 1.10 | 2.14 | 0.64 |
| WavLM layer 12 mean | 1.09 | 2.51 | 0.57 |

The x-vector registers falsetto as a person-sized change (1.19× another
speaker) and 4.34× a sentence change; it does not collapse a speaker's
falsetto onto their modal voice. Late layers are content-dominated: the same
text in falsetto is closer than the same voice on another sentence. Early
layers respond most to phonation and are the least stable per clip. The
acoustic five's whisper ratio is a median over the 31 whisper clips
the sparse-voicing gate still reports, and its falsetto ratio rides on the
tracker whose octave errors the audit below documents.

## Extractor audit (`acoustics.py` on the archive clips; `research_jvs_halving_audit.py`)

Five matched sentences per speaker in modal, whispered and falsetto voice
(500 / 500 / 495 clips), measured with `acoustics.py` 3.1.0.

- Whisper: the sparse-voicing rule (#60) returns an empty feature set for
  469 of 500 clips; the 31 it still reports carry a median 0.64 s of voiced
  speech. Under the 3.0.0 gate (five voiced frames), measured before #60 and
  not reproducible from this version, 234 clips were withheld and the rest
  reported medians from a few frames of noise.
- Falsetto: full coverage, no hits on the 500 Hz ceiling (tracked f0 p50 /
  p90 / max 341.4 / 399.0 / 439.4 Hz). Median falsetto/modal f0 ratio 1.7 (p10
  1.13, p90 2.76); 56 of 495 pairs change by under 15 %.
- Halving check (the rule of #62, computed here): a frame counts as halved
  when the odd harmonics of the tracked pitch sit more than 10 dB below the
  even ones. Modal clips: p90 0.0 %, max 4.9 %, none above 20 %. Falsetto:
  204 of 495 clips above 20 %, including all 56 of the "barely changed"
  pairs, so those are tracker octave errors; flagged clips track at a median
  325 Hz (p25–p75 304–347), under a 500 Hz ceiling that forbids the true value.
  The acoustic five's falsetto values in the tables above are therefore
  understated for about 41 % of the falsetto clips.
- Against a second Praat pass with a 1000 Hz ceiling as a higher-ceiling
  reference (not an annotation of the fundamental; a frame counts as halved
  where that track is twice the 500 Hz one): falsetto sensitivity 0.998,
  specificity 0.996 over 118,314 voiced frames (23,151 halved by the
  reference); modal specificity 0.999 with 10 reference-halved frames in
  110,755, too few to read a sensitivity from.
  On whisper the rule agrees with the reference far less (sensitivity 0.41,
  specificity 0.975 over 4,650 voiced frames; 107 of the 500 clips exceed
  20 %): on whisper-like input the halving share is not a reliable reading,
  which matters if #62's number is ever gated on.

## Supervised probes (`probe-seed0.json`, `probe-seed1.json`)

Protocol: 5 outer speaker folds × 2 repeats, stratified by group; inner 4
folds choose the layer (1–6 for the early-layer family), the PCA rank k
(8, 16, 32, 64) and the ridge strength λ (0.1, 1, 10, 100, 1000) on the single-clip query
criterion. Metric: training-fitted centering and PCA, then a non-negative
diagonal metric fitted by NNLS on within-group pair dissimilarity 3 − S with
ridge toward the uniform metric. "Whitened" variants equalize component
variance first; "projected" variants keep the raw geometry. Neural vectors
are unit-normalised before every probe; the acoustic candidates enter with
the app's robust scaling. "+aug" adds single non-parallel clips of one
speaker against the other's centroid at controlled total weight. Whisper and
falsetto never enter training. Evaluation on held-out speakers: single
non-parallel clips (duration median 4.8 s, p10 3.3, p90 8.0) ranked against the
training reference library — per speaker, the mean per-query ρ over five
drawn clips; the tables report the median over speakers × repeats; the
duration figures are from a sample of 100 of those clips — the
query's own centroid, and centroid–centroid test pairs (Spearman over the
pairs of each test fold, averaged over folds). Seeds 0 and 1 are listed as
two numbers.

Single-clip query, median per-query ρ:

| candidate | raw | whitened, uniform | whitened, learned | projected, uniform | projected, learned | projected, learned + aug |
|---|---|---|---|---|---|---|
| acoustic five | 0.204, 0.192 | 0.141, 0.143 | 0.170, 0.151 | 0.195, 0.192 | 0.206, 0.191 | 0.190, 0.202 |
| expanded acoustics | 0.217, 0.218 | 0.162, 0.170 | 0.192, 0.200 | 0.213, 0.219 | 0.227, 0.223 | 0.222, 0.220 |
| x-vector | 0.267, 0.263 | 0.207, 0.203 | 0.228, 0.233 | 0.266, 0.248 | 0.261, 0.259 | 0.258, 0.265 |
| early layer (chosen in the inner folds) | 0.305, 0.294 | 0.259, 0.279 | 0.265, 0.270 | 0.307, 0.303 | 0.308, 0.307 | 0.311, 0.295 |

Query centroid, median ρ:

| candidate | raw | whitened, uniform | whitened, learned | projected, uniform | projected, learned | projected, learned + aug |
|---|---|---|---|---|---|---|
| acoustic five | 0.233, 0.224 | 0.226, 0.227 | 0.235, 0.227 | 0.222, 0.218 | 0.233, 0.230 | 0.228, 0.219 |
| expanded acoustics | 0.274, 0.280 | 0.265, 0.271 | 0.289, 0.283 | 0.287, 0.294 | 0.293, 0.293 | 0.309, 0.297 |
| x-vector | 0.289, 0.292 | 0.229, 0.232 | 0.249, 0.253 | 0.305, 0.280 | 0.301, 0.289 | 0.280, 0.304 |
| early layer (chosen in the inner folds) | 0.390, 0.366 | 0.326, 0.324 | 0.330, 0.339 | 0.361, 0.364 | 0.370, 0.372 | 0.380, 0.357 |

Centroid–centroid test pairs, female / male, range over the two seeds:

| candidate | raw | projected, learned | projected, learned + aug |
|---|---|---|---|
| acoustic five | 0.20–0.27 / 0.25–0.26 | 0.23–0.24 / 0.32–0.33 | 0.22–0.26 / 0.27–0.28 |
| expanded acoustics | 0.31–0.35 / 0.29–0.34 | 0.30–0.33 / 0.31–0.38 | 0.29–0.30 / 0.30–0.34 |
| x-vector | 0.28–0.30 / 0.25–0.29 | 0.23–0.30 / 0.26–0.27 | 0.27–0.28 / 0.23–0.29 |
| early layer (chosen in the inner folds) | 0.40–0.43 / 0.32–0.39 | 0.37–0.39 / 0.26–0.31 | 0.33–0.36 / 0.30–0.40 |

Layers chosen most often for the early-layer family: raw L02, L03;
projected, learned L02 k=32 λ=100, L02 k=16 λ=1000, L02 k=16 λ=100.

Sensitivity of the fitted metrics (falsetto ÷ other speaker, whisper ÷
other speaker; raw → projected, learned; fitted on every speaker with the
most often chosen hyperparameters), seed 0: x-vector 1.19 → 1.04 and 1.41 → 1.15;
early layer 2.04 → 1.30 and 3.77 → 1.71; acoustic five 1.77 → 1.89;
expanded acoustics 2.14 → 2.33 and 4.12 → 4.35.

Readings:

1. With 2,451 pair means, no diagonal metric on any candidate beats its raw
   distance beyond seed-to-seed noise (about ±0.03). Whitening costs every
   neural candidate before the metric is fitted; the projected variants
   stay at the raw level.
2. The x-vector does not catch up to the early layers under this probe
   class, at either granularity. Its disadvantage is not a recoverable
   diagonal distortion of its own PCA coordinates. A full-rank or nonlinear
   probe was not tried.
3. In the tested neural metrics, training on speaker-pair similarity
   reduced the relative separation of falsetto and whisper from other
   speakers without a compensating gain in reference ranking, so the raw
   representation is retained; under the whitened learned metric the
   x-vector's falsetto ratio falls to 0.94, a speaker's falsetto closer than
   another speaker on the same text. The ratio does not say whether the
   numerator or the denominator moved. The acoustic candidates' ratios did
   not fall (acoustic five whisper 2.81 → 2.79).
4. Layer choice by the raw scores is itself model selection on this sample;
   the raw table is exploratory, the nested-probe numbers are the honest
   held-out estimates.

## Expanded acoustic vector (`expanded.npz`; the `acoustic_expanded` rows above)

Nineteen measures per clip from `extract_expanded_acoustics.py`: f0 median
and SD (semitones), pitch span, F1/F2/F3 medians, ΔF and its frame SD, HNR
and SD, spectral balance and SD, CPPS (Praat, 60–500 Hz search), LTAS slope
0–1 kHz vs 1–4 kHz, uncorrected H1–H2 median and SD, local jitter and
shimmer, and the voiced fraction of speech-level frames. Robust-scaled
Euclid as the raw distance. A project-specific expansion, not Chiu et al.'s
26 (theirs use formant-corrected harmonic measures and coefficients of
variation), and a different Praat configuration from `evaluate_ratings.py`.

Against the acoustic five it gains +0.01 / +0.03 median ρ on single clips
(seed 0 / seed 1) and +0.04 / +0.06 on centroids. Paired difference to the x-vector on
all-speaker centroids: +0.02 [-0.14, +0.18] female, -0.01 [-0.14, +0.12] male
(acoustic five: -0.03 [-0.17, +0.13], -0.07 [-0.23, +0.09]) — competitive with
the x-vector in this comparison; the intervals span zero, so the data leave
the difference undecided rather than showing equivalence. It does not reach
the early layers for reference ranking, but its response to a deliberate
change survives supervision, and every dimension is nameable. Its whisper
ratio is computed on the whisper clips the sparse-voicing gate still
reports, and its falsetto ratio on the same tracker the audit documents.

## Deployment check (`deploy-check.json`, `research_jvs_deploy_check.py`)

The prepared int8 ONNX graph (`prepare_voice_models.py`, descriptor
`wavlm-l3-int8-v1`) returns layer-3 frames next to the x-vector. Every row
below is computed from audio by the check script on the 5,000 prepared clips'
parallel sentences plus the first five non-parallel clips per speaker
(2500 clips; `perception.span` rejects 19 of them for holding under two seconds
of audible speech, all of them non-parallel, so the single-clip rows are
drawn from a slightly different population than the benchmark's). Spearman on parallel-sentence centroids (female /
male) and median per-query ρ from one non-parallel clip:

| pipeline | centroid f / m | single clip f / m |
|---|---|---|
| int8 x-vector, three trimmed 4 s windows (deployed identity descriptor) | 0.286 / 0.337 | 0.263 / 0.261 |
| int8 layer 3, the same three windows, mean over all frames | 0.375 / 0.305 | 0.277 / 0.226 |
| int8 layer 3, quiet edges trimmed, one ≤ 8 s crop, all frames | 0.377 / 0.300 | 0.305 / 0.216 |
| int8 layer 3, untrimmed ≤ 8 s centre crop, all frames | 0.428 / 0.352 | 0.320 / 0.272 |
| int8 layer 3, untrimmed crop, speech frames only | 0.453 / 0.424 | 0.344 / 0.309 |
| fp32 layer 3, trimmed crop, all frames | 0.378 / 0.306 | 0.305 / 0.222 |
| fp32 layer 3, untrimmed crop, all frames | 0.428 / 0.357 | 0.321 / 0.271 |
| fp32 layer 3, untrimmed crop, speech frames only | 0.455 / 0.423 | 0.342 / 0.312 |
| **int8 `perception.timbre` at the recorded commit (#64: ≤ 8 s crop centred on the audible span, speech-frame pooling; #79 changes the crop rule, not the pooling)** | 0.452 / 0.425 | 0.344 / 0.306 |

Readings: quantization brings no material change in ρ. Cutting the quiet
edges before the model costs about 0.05 in both groups, so the model wants
the surrounding signal as context; leaving the silent frames out of the
pooling is what helps, and gives the male group its margin over the
x-vector. The fp32 untrimmed-crop row reproduces the benchmark's layer-3
parallel-sentence row exactly (0.428 / 0.357 and every anchor statistic):
two scripts, one under fp16 autocast and one fp32, on centroids of the same
clips. Paired difference of the measured function to the deployed x-vector
under shared speaker bootstraps: female +0.17 [+0.06, +0.28], male +0.09
[-0.02, +0.20]; the shipped function's own intervals are [0.35, 0.56] and [0.30, 0.53],
the x-vector's [0.14, 0.42] and [0.20, 0.45]. When #64 re-exported the graph the x-vector output
moved by cosine ≤ 0.0005 from the earlier file (measured then; the earlier
file is not tracked), an order of magnitude under its int8 error, so its
descriptor version is unchanged.

The deployment figures are selection-set figures like the rest: the layer,
the crop length and the pooling threshold were chosen on these ratings.

## Current position

- Substrate for reference ranking: WavLM layer 2 or 3, mean-pooled, raw
  cosine. Best on centroids and on single clips ranked against centroids;
  against single clips the x-vector still wins. The single-clip margin over
  the x-vector in the probes is +0.03 to +0.04 median ρ.
- Keep the x-vector for short different-text queries and as the identity
  reference; it is the most content-robust single-clip representation.
- Ship the untrained distance. Any future learned metric must preserve
  and validate sensitivity to within-speaker changes; speaker-level ranking
  alone is an insufficient selection criterion.
- Extractor: the sparse-voicing rule landed in #60 and its reported
  fraction is corrected in #76; the halving share is pending in #62; the
  timbre crop's silent-window case is fixed in #79.
- Coaching layer: grow the acoustic five to the expanded set. It is
  competitive with the x-vector on listener ordering, keeps phonation
  sensitivity under supervision, and stays interpretable. CPPS is the slowest measure;
  the whole extraction took about 1,350 s for 6,495 clips on twelve
  processes.
- Open: a full-rank or nonlinear probe on the x-vector; within-speaker
  listener judgements; the reliability ceiling of the JVS ratings.

## Sources used

- Takamichi, S. et al. JVS corpus and its tags (README and similarity CSVs
  in `jvs_ver1.zip`; https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus).
- Chen, S. et al. 2022, WavLM (arXiv 2110.13900); model cards for
  `microsoft/wavlm-base-plus` and `microsoft/wavlm-base-plus-sv`, the latter
  documenting `use_weighted_layer_sum`.
- Chiu et al. 2026, Voice Timbre Attribute Detection with compact,
  training-free acoustic parameters (arXiv 2603.05091): motivation for the
  expanded acoustic set.
- Huckvale 2025, Interpreting the dimensions of speaker embedding space
  (arXiv 2510.16489).
- Nylén, Holmberg & Södersten 2024, Acoustic cues to femininity and
  masculinity in spontaneous speech, JASA (doi 10.1121/10.0025932).
- Doukhan et al. 2024, Voice Passing (arXiv 2404.15176).
- Fujita & Ijima 2026, Investigation for relative voice impression
  estimation (arXiv 2602.14172).
- Netzorg et al. 2025, Interspeech, on pitch / resonance / weight
  configurations and perceived gender versus naturalness
  (https://www.isca-archive.org/interspeech_2025/netzorg25_interspeech.html).
- Speech After Gender 2024 (arXiv 2407.07235) and the Versatile Voice
  Dataset, on speaker verification failing across deliberate voice changes.
- VoxSim (arXiv 2407.18505); vTAD challenge (arXiv 2509.06635, VCTK-RVA);
  Kishi et al. 2026, Do speech foundation models perceive speaker similarity
  as humans do? (arXiv 2606.05739), whose per-dimension standardisation
  differs from the raw cosine used here.
- Cawley & Talbot 2010, JMLR, on selection bias in model selection;
  Schütt et al. 2023, eLife 82566, on speaker/item resampling and self-pairs
  when bootstrapping representational distance matrices.
- Chen et al. 2021, Voice gender scoring and independent acoustic
  characterization of perceived masculinity and femininity (arXiv 2102.07982); Leung et al.
  2021 on category versus continuous femininity cues (PMID 34232704).
