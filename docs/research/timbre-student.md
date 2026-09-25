# A small model for the timbre descriptor

The closest-to-you order compares recordings by the frames of WavLM encoder layer 3, pooled over
speech (`jvs-similarity.md`, `ranking.md`). Cut at that layer, the WavLM graph is 58 MB
(`timbre.int8.onnx`). `distill/` trains a 3.6 M-parameter model to reproduce those frames, and
`perception.timbre` runs it (`timbre-student.int8.onnx`, 4.6 MB). Evaluation figures are in
`timbre-student-eval.json`, written by `distill/eval.py`.

## Model

- A log-mel front end (400-sample Hann window, 160-sample hop, 80 bands, 20–7,600 Hz) written as
  two fixed convolutions, so the exported graph needs no STFT operator.
- A stride-2 convolution onto the teacher's 20 ms grid, four Conformer blocks (width 192, four
  heads, feed-forward 768, depthwise kernel 15), and a projection to 768 dimensions. For an input
  of *n* samples it returns (*n* − 400) // 320 + 1 frames, the teacher's count.
- Learned weights are stored as int8 per output channel and dequantized on load; the arithmetic is
  fp32. LayerNorm is written out as centred operations: onnxruntime 1.24's fused
  LayerNormalization returns NaN on a frame whose values are all equal, which digital silence
  produces in the mel bands.

## Training

`distill/targets.py` runs the teacher on the exact crop `perception.timbre` would feed it and keeps
the frames and the speech mask. Audio: every JVS recording of the speakers not held out (all
styles, including falsetto and whisper) and the served Common Voice libraries in all four
languages, 12,843 clips from 1,804 speakers. Held out entirely: 40 JVS speakers (20 female, 20 male,
drawn with a fixed seed) and 30 % of the Japanese Common Voice speakers (134). No listener ratings
enter training.

`distill/train.py` minimises, per batch of similar-length clips: L1 between frames standardised by
the teacher's per-dimension spread, frame cosine, cosine between the speech-pooled descriptors
(weight 10), and the squared gap between the student's and the teacher's pairwise descriptor
cosines across the batch (weight 100). AdamW, learning rate 1e-3 with 1,000 warm-up steps and a
cosine decay, batch 32, 30,000 steps, about 55 minutes on one GPU. One seed.

## Held-out evaluation

Teacher and student run through the same crop and pooling on speakers neither the student nor the
choice of its settings saw.

| | teacher (layer-3 graph) | student |
|---|---|---|
| agreement with JVS listener ratings, held-out speakers ranking each other | 0.348 | 0.386 |
| held-out speaker retrieval, top-1 (48 speakers, 315 queries) | 95.6 % | 90.2 % |
| same voice on another sentence closer than the same sentence in another voice (4,628 triples) | 99.7 % | 99.5 % |
| Versatile Voice Dataset, Spearman with steps of pitch / resonance / weight | 0.39 / 0.41 / 0.26 | 0.44 / 0.42 / 0.19 |

Student minus teacher on listener agreement, per held-out query speaker: +0.038, 95 % speaker
bootstrap [+0.017, +0.057]. The student's descriptors sit at a median cosine of 0.963 to the
teacher's (5th percentile 0.913, minimum 0.825, over 2,000 clips).

On an 8 s input with two CPU threads the student takes 13 ms and 38 MB above the runtime, the
layer-3 graph 181 ms and 227 MB.

## Limits

- One training seed and 40 held-out JVS speakers. The agreement gain is the least certain figure
  here; the retrieval loss is the most certain.
- The JVS ratings pair speakers only within the female and within the male group.
- The descriptor is new (`student-l3-v1`): every index and cached vector is rebuilt with it.
- The student is trained on JVS audio as well as Common Voice. The JVS terms restrict
  redistribution of the audio; the model ships inside the analysis container only, as the index
  built from the same clips does, and is not served to browsers.

## Sources

- Chen, S. et al. 2022, WavLM (arXiv 2110.13900); `microsoft/wavlm-base-plus-sv`.
- Chang, H.-J. et al. 2022, DistilHuBERT (arXiv 2110.01900), on distilling a speech
  representation model into a small student.
- Gulati, A. et al. 2020, Conformer (arXiv 2005.08100).
- Takamichi, S. et al., JVS corpus and its similarity ratings.
- Netzorg, R. et al. 2024, Speech After Gender (arXiv 2407.07235); the Versatile Voice Dataset.
