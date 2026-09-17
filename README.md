# Koenami

A voice training tool for anyone working toward a feminine or masculine voice: people aiming to become 両声類 (able to speak in both a feminine and a masculine voice), transgender people, and anyone who simply wants to try a voice they do not have yet. Japanese comes first, followed by Mandarin, English, and Korean. Free and open source.

Pick a voice you want to get closer to, from the bundled references or your own audio, then record while imitating it. Your voice is projected into the same acoustic space, so you can see how close you are and in which direction the gap lies. Real-time measurement plots the microphone as you speak, so you can adjust while watching the distance shrink.

Planned next: voice-training tutorials, analysis from the angles of phonetics, vocal pedagogy, acoustics and anatomy, and evaluation that tracks how listeners actually hear a voice more closely.

[Public demo](https://koe.transnavi.jp/) · [Source](https://github.com/transnavi/koenami) · [MIT license](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/studio-dark.png">
  <img src="docs/images/studio-light.png" alt="Koenami's Japanese studio: a 3D voice map, acoustic measurements, speaker library, and waveform playback timeline.">
</picture>

The recording track in these screenshots uses a public Common Voice clip.

- Record with **R**, play with **Space**, cancel with **Esc**.
- **Live** continuously plots microphone input. Its shape shows the most recent five seconds; settings let you choose 1–30 seconds. The headphones button enables microphone monitoring; headphones avoid acoustic feedback.
- Recordings are saved and playable as soon as capture stops. Measurements finish in the background, so another take can start immediately. Saved recordings remain available after refresh. Their averages appear on the map; the recording title opens the history menu. Each row has download and delete buttons.
- Compare pitch, resonance, harmonicity, spectral balance, and pitch variation. Orbit, pan, and scroll to zoom the 3D map. The dock combines a waveform playback timeline with pitch, spectrum, and spectrogram comparisons. Click the waveform to seek or drag to select a section.
- Browse references by speaker, search speaker IDs with or without spaces, favorite individual clips, and adjust playback speed without changing pitch.
- Import an official **JVS ZIP or extracted folder** through the **JVS banner** in the sample library. Imports are verified against original-file checksums, saved in IndexedDB, and restored on refresh. A single speaker folder also works.

![Waveform playback timeline above an overlaid spectrogram comparison.](docs/images/spectrogram.png)

The current map uses speaker-balanced PCA of five acoustic measurements. The comparison readout reports the full five-dimensional acoustic distance to the selected reference (zero means equal measured features). Its report shows how much of the difference is omitted by the 2D or 3D projection. It is not calibrated to listener judgments of gender, naturalness, or vocal quality. The underlying measurements can vary with phonetic content and recording conditions. See the app’s method page for definitions and limitations, and `/references.html` for every source with its type and where it is used.

## Local development

Requires [Bun](https://bun.sh/), Python 3.12, and [uv](https://docs.astral.sh/uv/).

```sh
bun install
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python fetch_demo.py
bun run dev
```

Open `http://localhost:8766/ja/`. Vite provides HMR and proxies the Python analyzer on port 35511. Where `devrun` is available, launch with `devrun bun run dev` to cap resources and stop both services together.

The studio speaks Japanese at `/` (and `/ja/`), Mandarin at `/zh-CN/`, English at `/en/` and Korean at `/ko/`; each page loads the references of its language, and the language selector navigates between them. The texts live in `web/i18n/<lang>.js`, one catalogue per language with the same keys, and `web/i18n/index.js` provides the translator. `web/index.html` and `web/result.html` are templates: the dev server fills them per request from the URL, and the build writes one document per language (with its own `<html lang>`, title, canonical and hreflang alternates) plus a web app manifest per language. Analysis requests carry `Accept-Language`, so `worker.ts` and `server.py` answer errors in the studio's language. The share card draws with a Noto Sans subset in the JP, SC or KR cut; `uv run build_share_font.py` regenerates the six files in `web/public/fonts` from the variable fonts on the machine. `node i18n_test.mjs` checks the catalogues against each other and renders every page. The guide, tutorial, method and references pages remain Japanese.

The SvelteKit application that replaces `web/` grows under `src/` (Svelte 5, Tailwind 4, `@sveltejs/adapter-cloudflare`); `bun run dev:kit` serves it on port 8767 against an analyzer started separately (`.venv/bin/python server.py --port 35511`), `bun run check` type-checks it with svelte-check, `bun run build:kit` builds it, and `bun run lint` / `bun run format` run Prettier over it. The pure modules of the studio (`math`, `space`, `cloud`, `storage`, `corpus-import` and the `capture` worklet) already live under `src/lib/` as typed ports; `KOENAMI_TREE=new bun run check:unit` runs the unit goldens and their 100 % gate against them. The adapter reads `wrangler.adapter.jsonc` and writes `.svelte-kit/cloudflare/`; `worker/entry.ts` re-exports that worker together with the analyzer container class and becomes the deployed entry once the studio has moved. Until then production builds the current app with `vite.web.config.js`.

`fetch_demo.py` downloads the reference audio from the public demo. The datasets are not included in this repository. To rebuild the larger local JVS collection, download the official archive into `research/jvs_ver1.zip`, build the measurement engine (`cargo build --release` in `measure/`, described below), then run `build_native.py` and `build_import_index.py`. Development loads all 5,000 prepared JVS recordings by default. The public-demo fetch supplies an import index without requiring a local copy of the full archive. To rebuild the Japanese Common Voice collection from its pinned source, run `.venv/bin/python build_common_voice_ja.py`; selection rules are in `curation/common-voice-ja.json`. Run `.venv/bin/python screen_reference_speech.py` (or `--cpu` without CUDA), then rebuild the collection. The screen runs Silero VAD and a Whisper transcription over every eligible clip and drops a clip when little speech is detected and the transcript is empty, a stock phrase Whisper emits on silence, or unintelligible against the prompt at a very low level. Model outputs are cached by audio checksum; verdicts are recomputed on each run. Display numbers are preserved in `curation/reference-labels.json`.

Listening reviews run in a separate local page, `http://localhost:8766/review.html`, which plays one clip per unreviewed speaker — Common Voice speakers, the 100 JVS professionals on one shared parallel sentence, and VOICEVOX voices interleaved 5 : 2 : 1 — and appends each judgement (0–6 ratings, perceived age as a decade, perceived age as a decade, per-clip quality flags — empty, murmur, noise, distortion — and native-like or non-native pronunciation as the 母語話者らしさ rating) to `curation/reviews.jsonl`. `curation.py` derives every exclusion and classifier label from that log; `build_common_voice_ja.py` and `build_pronunciation_model.py` read it. A second local page, `/pairs.html`, presents two clips that sit close in the timbre-vector space when the timbre index is loaded (the five-feature space otherwise; one pair in four is a distant control), a few pairs of one speaker's two most different clips, and repeats of earlier judgements for test–retest, and records which sounds more feminine, more natural, and which she would rather use as a reference, with the distance and the space it was drawn in, to `curation/pairs.jsonl`. WAV files in `data/own/` (ignored by git) are the listener's own takes: they join both queues with opaque ids and no name, and any judgement that mentions one is written to `data/own/*.jsonl` instead of the public logs. Neither page is published. Building the pronunciation classifier needs the WavLM ONNX model from `prepare_voice_models.py` (WavLM weights are MIT; the audEERING age model it also prepares is CC BY-NC-SA 4.0 and is not used by the app).

The same graph has a second output, the frames of encoder layer 3, which `perception.timbre` pools into a timbre vector (descriptor `wavlm-l3-int8-v2`): one pass over the eight seconds holding the most audible frames (ties toward the centre of the audible span), averaged over speech frames only (within 40 dB of the crop's loudest 20 ms frame and above the level floor). It is intended for ranking reference voices by similarity to a recording; that feature is a separate change. On the JVS speaker-similarity tags, cosine distance between these vectors agrees with the listeners better than the x-vector's does on parallel-sentence centroids for both groups, with a paired difference whose interval excludes zero for the female group and includes it for the male group; the figures, the intervals and what each preprocessing choice was worth are in `docs/research/jvs-similarity.md`, and they are selection-set figures, since the layer, crop length and pooling threshold were chosen on the same ratings. The x-vector remains the identity descriptor; the two must never share a cache.

`build_timbre_index.py` runs `perception.timbre` over every plotted reference clip and writes `data/timbre-index-<version>.npz` (`KOENAMI_CUDA=1 .venv-embedding/bin/python build_timbre_index.py` takes a few minutes on the GPU; the CPU run takes about an hour, less with `KOENAMI_ORT_THREADS` above the public box's two, or `0` to let ONNX Runtime choose); it saves at every checkpoint, so an interrupted build resumes, and a rerun only encodes clips added since. When that file matches the server's descriptor version and the prepared model is present, `POST /api/similar?lang=ja&limit=12` (`limit` 1–50, anything else a 400) takes raw 16 kHz samples like `/api/analyze` and returns the reference speakers whose centroid sits closest to the recording, each with its nearest clip and both cosine distances; `/api/catalog` lists the indexed languages under `capabilities.similar`. The public container ships the age model but not the WavLM graph or the index yet, so the capability is empty there.

`measure/` is the measurement engine in Rust, on the Phonia crates (`phx-pitch`, `phx-formant`, `phx-voice`, `phx-audio`): the same pitch, formant, harmonicity and spectral-balance analysis as `acoustics.py`, and the engine every reference library is built with. Build it once (`cargo build --release` in `measure/`; Rust 1.88 or newer; `measure/.cargo/config.toml` makes Cargo fetch the Phonia crates through the git command so an SSH alias for GitHub works). `measure/target/release/koenami-measure FILE...` decodes WAV, FLAC or MP3 files, resamples them to 16 kHz and prints one JSON line per file, in parallel; `--pcm 16000` reads raw float samples from stdin; `--version` prints the measurement version every result carries. `engine.py` wraps the binary for the builders and keeps each measurement cache (`data/*-measurements.json`) per engine version, saving every few hundred files, so a version change re-measures every library on the next build and an interrupted build resumes. Every library manifest's `version` is the engine version its clips were measured with. `measure/parity.py` compares the engine with `acoustics.py` on identical 16 kHz samples (pitch, harmonicity, balance and the quiet-interval statistics agree to rounding; formants to 0.003 % in ΔF at the median and 0.6 % at worst) and, with `--files`, on files the engine decodes and resamples itself, which adds the resampler seam (SciPy's polyphase filter in `acoustics.mono16` against rubato's windowed sinc in the crate).

Three research scripts read the review logs and write their findings under `research/` (not committed): `evaluate_ratings.py` measures an expanded Praat feature set per rated clip and reports test-retest reliability from blind repeats, speaker-held-out ridge and PLS predictions per scale with a permutation null; `evaluate_pronunciation.py` scores each labelled speaker's clips with faster-whisper against the known prompt (reading-form CER, token log-probability, morae per second) and evaluates a leave-one-speaker-out logistic regression on 母語話者らしさ; `screen_speaker_consistency.py` embeds every eligible Common Voice clip with the WavLM speaker-verification model and lists clips far from their speaker's other clips for a listening check.

`src/lib/measure/` runs that engine in the browser: `bun run build:wasm` compiles the crate to WebAssembly with wasm-pack (`measure`'s `wasm` feature, 457 KB, 188 KB over the wire) into `src/lib/measure/pkg/`, which is generated and not committed; `dev:kit`, `build:kit` and `check` build it first. `worker.ts` is the Web Worker that holds the module, `engine.ts` the studio's side of it: `analyze(pcm)` returns what the analyzer's `/api/analyze` returns, `live(pcm)` one live window with `active`, `mono16(samples, channels, rate)` the import path's mix and resample, each cancellable through an `AbortSignal`. A take measured this way needs no request, so the container's single-analysis queue stops being the limit on how many people can practise at once. The build is plain wasm rather than `+simd128`: SIMD measured 1 % faster here and would cost iOS 15 and 16.0-16.3 support. `tests/unit/measure.test.ts` measures the same samples through the wasm module and the native CLI and compares them, so the two stay one implementation. The SvelteKit studio still calls the analyzer; moving its own-voice paths onto the engine is the next step.

`build_pronunciation_model.py` evaluates the small listening-reviewed Japanese classifier with one speaker held out at a time. Set `KOENAMI_CUDA=1` in an environment with CUDA ONNX Runtime for model inference. Tentative pronunciation judgements are omitted from training. The prototype has insufficient validation for automatic filtering.

Optional word timing uses Whisper large-v3-turbo with CUDA and Sudachi. Install `requirements-asr.txt` and run `download_asr.py`. Optional VOICEVOX preparation uses `build_voicevox.py` with the separately installed VOICEVOX core, models, and dictionaries. These services are not required for the public demo.

## Public deployment

The frontend and approved sample files run on Cloudflare Workers Static Assets. A Cloudflare Container runs the same Python acoustic analyzer. The configuration permits one `basic` container, which sleeps after one minute idle. Public recordings are limited to one minute; failed analysis preserves the recording and offers retry from its title menu. GPU word timing is available only in the local setup.

```sh
bun run build:public
bun run check:worker
npx wrangler deploy
```

Configure your own Cloudflare account and hostname in `wrangler.jsonc` before deploying a fork. Docker must be running for the container build. Production deployments use `main`.

`prepare_public.py` creates an explicit deployment set in `.deploy/`. It copies only approved reference files and verifies their checksums. Private recordings, the full JVS archive, and research scratch files are excluded. The container includes only the prepared inference models and their upstream license notices; weights are never served as static assets. The Docker context uses an allowlist as an additional boundary.

## Data and licenses

**The MIT license applies to the application code. Audio, transcripts, metadata, model weights, and dependencies retain their original licenses.**

The public demo includes 10 JVS clips under the author’s small-website-excerpt allowance, Japanese Common Voice clips with speaker and clip exclusions recorded in `curation/common-voice-ja.json`, 54 credited VOICEVOX clips, and Common Voice collections in Mandarin, English, and Korean. The Japanese JVS corpus documents native professional speakers. Japanese Common Voice includes adult-labelled recordings with at least two positive votes and no negative votes. Known pronunciation mismatches and explicitly declared non-native accents are excluded. Most speakers have not undergone listening review; Japanese dialect metadata alone does not establish native pronunciation. Native-speaker screening is also incomplete for the other languages.

- [JVS terms](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus): personal and noncommercial research use; full audio redistribution is restricted. JVS tags are CC BY-SA 4.0. The import index includes adapted metadata and computed acoustic measurements; it contains no audio.
- [Common Voice](https://commonvoice.mozilla.org/): CC0 audio collections. Clip-level manifests preserve the source and checksums.
- [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and [voice library terms](https://github.com/VOICEVOX/voicevox_vvm/blob/main/README.md): credit and character-specific conditions apply. Audio reuse must follow those terms.

VOICEVOX credits: 四国めたん、春日部つむぎ、雨晴はう、冥鳴ひまり、九州そら、中国うさぎ、玄野武宏、白上虎太郎、栗田まろん. Each sample displays its `VOICEVOX:<character>` credit.

Microphone audio and selected imported samples are sent to the analysis service for measurement. The analyzer does not save uploaded audio. Completed recordings and user-imported libraries are stored in the browser; clearing site data removes them.

## Verification

```sh
bun run build:public
bun run check:worker
bun run check:tests
bun run check:all
bun run check:kit
.venv/bin/python tests.py
```

`check:all` runs the characterization suite that pins the behaviour of the browser app, and `check:kit` runs the same suite against the SvelteKit tree (`KOENAMI_TREE=new`: `src/` built without minification and with source maps into `.svelte-kit/cloudflare`, the production build's directory, so build again before deploying): unit tests with coverage (`tests/unit`), the browser scenarios (`e2e/scenarios`), the merged coverage report and the 100 % gate. Every test compares what it observes with a golden recorded against the commit named in `tests/golden/META.json`; the goldens describe that commit, and a rewrite has to reproduce them.

- **Unit layer** (vitest): `math`, `space`, `cloud`, `storage`, `corpus-import`, the `capture` worklet and the service worker (`web/public/sw.js`, with stand-ins for its global scope) are driven with fixed inputs and their outputs compared byte for byte with `tests/golden/unit`. The pinned `web/*.js` is extracted to `tests/old-tree` by the test setup (`git archive` needs that commit locally, so a shallow clone must fetch it). `KOENAMI_TREE=new` runs the same tests against `src/lib`; recording is refused there. Floating-point results, error message text and the order of stored records are all part of the contract.
- **Browser layer** (Playwright, Chromium): `tests/mock-api/server.mjs` serves the pinned `web/` tree (`tests/old-tree`, or the directory named by `E2E_STATIC` with `KOENAMI_TREE=new`), the recorded analyzer responses under `tests/fixtures/api` and the CC0 audio under `tests/fixtures/data`, so every machine sees the same API. What the goldens require of a rewrite, and the small `window.voiceApp` hook the tests read (`e2e/hooks.ts`), is written down in `e2e/CONTRACT.md`. The page clock is paused and advanced only by the tests; the microphone is Chromium's fake device playing `tests/fixtures/audio/microphone.wav`. After each step a test records the state of every element with an id, `localStorage`, IndexedDB (large payloads as hashes), the API requests made so far and, where the drawing does not depend on real audio time, the pixel-exact PNG each canvas encodes of itself (`tests/golden/e2e`, `tests/golden/canvas`). Values that follow real media time or microphone content (clocks, seek positions, sample hashes, live readouts) are masked and marked as such in the goldens.
- **Coverage gate**: both layers collect native V8 coverage (the browser with `--js-flags=--no-opt`, since the optimiser drops block counters), `coverage:report` converts it to istanbul reports over the same source files, and `coverage:check` requires every statement, branch, function and line of `web/*.js` and `web/public/sw.js` (of `src/` in the Kit tree, server modules aside), and fails when a source file appears in no coverage data. The locations the suite cannot reach are listed in `tests/coverage/exclusions.json` with the line, the source text and the reason (dead code, guards behind disabled controls, token races, fallbacks for fields the data never omits, the private baseline take, browser constants); an entry that no longer matches an uncovered location fails the gate, so the list cannot go stale.

`bun run test:e2e:record` re-records the browser goldens and API fixtures against the real analyzer (it needs the Python environment and the models; `KOENAMI_PYTHON` points at another interpreter). `tests/fixtures/data` is built from a prepared public data set by `tests/scripts/build-fixture-data.mjs`; `tests/fixtures/audio/SOURCES.md` lists where the audio comes from.

`tests.py` contains additional acoustic regression checks against local controlled audio fixtures; those fixtures are not published.

## Acknowledgments

The comparison workflow draws on [Acoustic Gender Space](https://acousticgender.space/), [Phonia](https://phonia.app/), and [InFormant](https://in-formant.app/). Colors draw on [とらんすナビ](https://transnavi.jp/). The app is independently developed.

For Chinese-language practice material, see [あおぎ葵’s MTF声音女性化练习手册](https://www.bilibili.com/opus/546442165017071774), a community guide covering source–filter concepts and Praat examples. Measurement definitions are documented on the app’s method page.
