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
- Browse references by speaker, search speaker IDs with or without spaces, favorite individual clips, and adjust playback speed without changing pitch. "Closest to you" orders the speakers by a WavLM-based similarity that follows listener judgements more closely than the five map measures.
- Listen to 5,000 JVS references from 100 speakers directly in the Japanese library. Koenami has permission to provide these recordings for noncommercial voice practice.

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

The studio speaks Japanese at `/` (and `/ja/`), Mandarin at `/zh-CN/`, English at `/en/` and Korean at `/ko/`; each page loads the references of its language, and the language selector navigates between them. The texts are [Paraglide](https://paraglidejs.com/) messages in `messages/<locale>.json` (inlang message format, the locales listed in `project.inlang/settings.json`); the build compiles them into typed functions under `src/lib/paraglide/`, called as `m.toolbar_share()`. Each request runs in the locale its path names (`src/hooks.server.ts`), `src/hooks.ts` maps `/en/…` onto the same route as `/…`, and messages resolve without a language being passed along; `src/lib/i18n/index.ts` holds the site's per-language facts (addresses, Open Graph locales, card fonts) and renders the page templates under `src/lib/studio/`. The build prerenders one document per language (with its own `<html lang>`, title, canonical and hreflang alternates) plus a web app manifest per language. Analysis requests carry `Accept-Language`, so `worker.ts` and `server.py` answer errors in the studio's language. The share card draws with a Noto Sans subset in the JP, SC or KR cut; `uv run build_share_font.py` regenerates the six files in `static/fonts` from the variable fonts on the machine; `tests/unit/i18n.test.ts` checks the message files against each other and pins the rendered head of every language. The guide, method and references pages are Japanese; the tutorial also has an English page at `/en/tutorial.html`.

The studio is a SvelteKit application under `src/` (Svelte 5, Tailwind 4, `@sveltejs/adapter-cloudflare`): `src/routes` prerenders every page from the templates in `src/lib/studio`, `src/lib/studio/app.ts` is the controller, `src/lib` holds the modules, and `src/service-worker.ts` is the service worker of the production build. `bun run check` type-checks it with svelte-check, `bun run build` builds it, and `bun run lint` runs oxlint (type-aware, with `oxlint-tsgolint`) and `oxfmt --check` over the TypeScript, the scenarios and the tests; `bun run format` writes the formatting (`.oxfmtrc.json`, `.oxlintrc.json`; Svelte markup is checked by svelte-check). The adapter reads `wrangler.adapter.jsonc` and writes `.svelte-kit/cloudflare/`, which `prepare_public.py` copies into the deployment set as the asset tree; `worker.ts` stays the deployed entry and serves those files by path (`worker/entry.ts` re-exports the adapter's worker for a future move of the routing into Kit).

`fetch_demo.py` downloads the reference audio from the public demo. The datasets are not included in this repository. To rebuild the larger local JVS collection, download the official archive into `research/jvs_ver1.zip`, build the measurement engine (`cargo build --release` in `measure/`, described below), then run `build_native.py` and `build_import_index.py`. Development loads all 5,000 prepared JVS recordings by default. The public-demo fetch supplies an import index without requiring a local copy of the full archive. To rebuild the Japanese Common Voice collection from its pinned source, run `.venv/bin/python build_common_voice_ja.py`; selection rules are in `curation/common-voice-ja.json`. Run `.venv/bin/python screen_reference_speech.py` (or `--cpu` without CUDA), then rebuild the collection. The screen runs Silero VAD and a Whisper transcription over every eligible clip and drops a clip when little speech is detected and the transcript is empty, a stock phrase Whisper emits on silence, or unintelligible against the prompt at a very low level. Model outputs are cached by audio checksum; verdicts are recomputed on each run. Display numbers are preserved in `curation/reference-labels.json`.

`bun run serve` builds the site and serves it together with the API from one Python process on port 8766 (`server.py --static .svelte-kit/cloudflare`), which is the lighter way to use the local review pages for hours; the Kit dev server is for editing the UI.

Listening reviews run in a separate local page, `http://localhost:8766/review.html`, which plays one clip per unreviewed speaker — Common Voice speakers, the 100 JVS professionals on one shared parallel sentence, and VOICEVOX voices interleaved 5 : 2 : 1 — and appends each judgement (0–6 ratings, perceived age as a decade, perceived age as a decade, per-clip quality flags — empty, murmur, noise, distortion — and native-like or non-native pronunciation as the 母語話者らしさ rating) to `curation/reviews.jsonl`. `curation.py` derives every exclusion and classifier label from that log; `build_common_voice_ja.py` and `build_pronunciation_model.py` read it. A second local page, `/pairs.html`, presents two clips that sit close in the timbre-vector space when the timbre index is loaded (the five-feature space otherwise; one pair in four is a distant control), a few pairs of one speaker's two most different clips, and repeats of earlier judgements for test–retest, and records which sounds more feminine, more natural, and which she would rather use as a reference, with the distance and the space it was drawn in, to `curation/pairs.jsonl`. WAV files in `data/own/` (ignored by git) are the listener's own takes: they join both queues with opaque ids and no name, and any judgement that mentions one is written to `data/own/*.jsonl` instead of the public logs. Neither page is published. Building the pronunciation classifier needs the WavLM ONNX model from `prepare_voice_models.py` (WavLM weights are MIT; the audEERING age model it also prepares is CC BY-NC-SA 4.0 and is not used by the app).

The same graph has a second output, the frames of encoder layer 3. `prepare_voice_models.py` also cuts that graph at layer 3 into `timbre.int8.onnx` (58 MB against 140 MB; the frontend and the first three encoder layers with the same weights), which returns the same frames bit for bit. `distill/` trains a 3.6 M-parameter model to reproduce those frames (`python distill/targets.py split`, `targets.py run K N` per shard, written as `shard-K-of-N` so training refuses a mixed or incomplete set, `train.py`, then `export.py student-base.pt`, which installs `timbre-student.int8.onnx`, 4.6 MB, with a card beside it; working files go to the ignored `research/distill/`). The trained model is not in the repository, as the prepared WavLM graph and the index are not: training needs the JVS archive and the Common Voice libraries, about an hour on one GPU, and the deployment set cannot be built without it. `perception.timbre` runs that model and pools its frames into a timbre vector (descriptor `student-l3-v1`); `docs/research/timbre-student.md` compares it with the layer-3 graph on held-out speakers. The pooling takes one pass over the eight seconds holding the most audible frames (ties toward the centre of the audible span), averaged over speech frames only (within 40 dB of the crop's loudest 20 ms frame and above the level floor). The studio's "closest to you" order of the reference library is this ranking (`sort.near`): the take, or its selected section, goes to `/api/similar`, the speakers sort by the cosine distance between the take's vector and each speaker's centroid, and each speaker's nearest clip leads its folder; a caption above the list says whether the timbre ranking or the map's five measures ordered it, since the five-measure distance remains the fallback when the analyzer has no index for the language. On the JVS speaker-similarity tags, cosine distance between the layer-3 graph's vectors, which the model reproduces, agrees with the listeners better than the x-vector's does on parallel-sentence centroids for both groups, with a paired difference whose interval excludes zero for the female group and includes it for the male group; the figures, the intervals and what each preprocessing choice was worth are in `docs/research/jvs-similarity.md`, and they are selection-set figures, since the layer, crop length and pooling threshold were chosen on the same ratings. The x-vector remains the identity descriptor; the two must never share a cache.

`build_timbre_index.py` runs `perception.timbre` over every plotted reference clip and writes `data/timbre-index-<version>.npz` (`KOENAMI_CUDA=1 .venv-embedding/bin/python build_timbre_index.py` takes a few minutes on the GPU; the CPU run takes about an hour, less with `KOENAMI_ORT_THREADS` above the public box's two, or `0` to let ONNX Runtime choose); it saves at every checkpoint, so an interrupted build resumes, and a rerun only encodes clips added since. When that file matches the server's descriptor version and the prepared model is present, `POST /api/similar?lang=ja&limit=12` (`limit` is clamped to 1–5000, a non-number is a 400; the studio asks for 5000 to order every speaker) takes raw 16 kHz samples like `/api/analyze` and returns the reference speakers whose centroid sits closest to the recording, each with its nearest clip and both cosine distances; `/api/catalog` lists the indexed languages under `capabilities.similar`. `prepare_public.py` copies the timbre model, its card, the WavLM licence notice and the index into the deployment set and writes the covered languages into the static catalog, so the public container serves the ranking; the model takes about 13 ms and 38 MB for eight seconds of audio on two desktop threads (the model sees at most eight seconds of audio) and proportionally more on the `basic` container's quarter vCPU, and the worker forwards `/api/similar` under the same per-IP rate limit as `/api/analyze`.

`measure/` is the measurement engine in Rust, on the Phonia crates (`phx-pitch`, `phx-formant`, `phx-voice`, `phx-audio`): the same pitch, formant, harmonicity and spectral-balance analysis as `acoustics.py`, and the engine every reference library is built with. Build it once (`cargo build --release` in `measure/`; Rust 1.88 or newer; `measure/.cargo/config.toml` makes Cargo fetch the Phonia crates through the git command so an SSH alias for GitHub works). `measure/target/release/koenami-measure FILE...` decodes WAV, FLAC or MP3 files, resamples them to 16 kHz and prints one JSON line per file, in parallel; `--pcm 16000` reads raw float samples from stdin; `--version` prints the measurement version every result carries. `engine.py` wraps the binary for the builders and keeps each measurement cache (`data/*-measurements.json`) per engine version, saving every few hundred files, so a version change re-measures every library on the next build and an interrupted build resumes. Every library manifest's `version` is the engine version its clips were measured with. Beyond the map's five, both engines report voice-quality measures: H1–H2 (`h1h2`, the first harmonic's level above the second, uncorrected for formants, over the voiced frames whose harmonic pattern agrees with the tracked pitch), the spread across voiced frames of H1–H2, formant spacing, harmonicity and balance (`*_sd`), and local jitter and shimmer over the glottal pulses (Praat's bounds on periods and ratios; the amplitude is the largest sample within half a period of the pulse; both engines share the definition, written out in `perturbation`). Cepstral peak prominence is deliberately absent: Phonia's per-frame CPP does not track Praat's CPPS (Spearman −0.08 over 4,998 JVS clips), and a definition that does is future work. `measure/parity.py` compares the engine with `acoustics.py` on identical 16 kHz samples (pitch, harmonicity and balance agree to rounding; H1–H2 to 0.03 dB and the spreads to 0.01 at worst over 30 clips; formants to 0.003 % in ΔF at the median and 0.6 % at worst; jitter and shimmer to 0.003 absolute, because each engine runs its own pulse search — Phonia's against Praat's — over the same pitch track) and, with `--files`, on files the engine decodes and resamples itself, which adds the resampler seam (SciPy's polyphase filter in `acoustics.mono16` against rubato's windowed sinc in the crate).

Three research scripts read the review logs and write their findings under `research/` (not committed): `evaluate_ratings.py` measures an expanded Praat feature set per rated clip and reports test-retest reliability from blind repeats, speaker-held-out ridge and PLS predictions per scale with a permutation null; `evaluate_pronunciation.py` scores each labelled speaker's clips with faster-whisper against the known prompt (reading-form CER, token log-probability, morae per second) and evaluates a leave-one-speaker-out logistic regression on 母語話者らしさ; `screen_speaker_consistency.py` embeds every eligible Common Voice clip with the WavLM speaker-verification model and lists clips far from their speaker's other clips for a listening check.

`src/lib/measure/` runs that engine in the browser: `bun run build:wasm` compiles the crate to WebAssembly with wasm-pack (`measure`'s `wasm` feature, 457 KB, 188 KB over the wire) into `src/lib/measure/pkg/`, which is generated and not committed; `dev`, `build` and `check` build it first. `worker.ts` is the Web Worker that holds the module, `engine.ts` the studio's side of it: `analyze(pcm)` returns what the analyzer's `/api/analyze` returns, `live(pcm)` one live window with `active`, `mono16(samples, channels, rate)` the import path's mix and resample, each cancellable through an `AbortSignal`. A take measured this way needs no request, so the container's single-analysis queue stops being the limit on how many people can practise at once. The build is plain wasm rather than `+simd128`: SIMD measured 1 % faster here and would cost iOS 15 and 16.0-16.3 support. `tests/unit/measure.test.ts` measures the same samples through the wasm module and the native CLI and compares them, so the two stay one implementation. The SvelteKit studio still calls the analyzer; moving its own-voice paths onto the engine is the next step.

`build_pronunciation_model.py` evaluates the small listening-reviewed Japanese classifier with one speaker held out at a time. Set `KOENAMI_CUDA=1` in an environment with CUDA ONNX Runtime for model inference. Tentative pronunciation judgements are omitted from training. The prototype has insufficient validation for automatic filtering.

Optional word timing uses Whisper large-v3-turbo with CUDA and Sudachi. Install `requirements-asr.txt` and run `download_asr.py`. Optional VOICEVOX preparation uses `build_voicevox.py` with the separately installed VOICEVOX core, models, and dictionaries. Optional Gemini references use `build_gemini_tts.py` with `GEMINI_API_KEY`: every Japanese voice in the Gemini 3.8 Flash TTS library speaks lines of everyday conversation from `curation/gemini-conversation-ja.json`; the clips join the reference set, locally and in the public demo, as synthetic voices marked AI. These services are not required for the public demo.

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

Koenami publishes 5,000 JVS clips from 100 speakers with permission from Shinnosuke Takamichi, granted on September 20, 2026 for noncommercial use. The public demo also includes Japanese Common Voice clips with exclusions recorded in `curation/common-voice-ja.json`, 54 credited VOICEVOX clips, synthetic everyday-conversation clips from Gemini 3.8 Flash TTS, and Common Voice collections in Mandarin, English, and Korean. The Japanese JVS corpus documents native professional speakers. Japanese Common Voice includes adult-labelled recordings with at least two positive votes and no negative votes. Known pronunciation mismatches and explicitly declared non-native accents are excluded. Most speakers have not undergone listening review; Japanese dialect metadata alone does not establish native pronunciation. Native-speaker screening is also incomplete for the other languages.

- [JVS terms](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus): Koenami has permission to host the requested 5,000 normal-speech recordings as noncommercial listening and comparison references. The selection and permission scope are recorded in [curation/jvs-publication.json](curation/jvs-publication.json). Further reuse and redistribution follow the original JVS terms; this permission does not relicense the corpus or extend to forks. JVS tags are CC BY-SA 4.0. The import index includes adapted metadata and computed acoustic measurements; it contains no audio.
- [Common Voice](https://commonvoice.mozilla.org/): CC0 audio collections. Clip-level manifests preserve the source and checksums.
- [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and [voice library terms](https://github.com/VOICEVOX/voicevox_vvm/blob/main/README.md): credit and character-specific conditions apply. Audio reuse must follow those terms.

VOICEVOX credits: 四国めたん、春日部つむぎ、雨晴はう、冥鳴ひまり、九州そら、中国うさぎ、玄野武宏、白上虎太郎、栗田まろん. Each sample displays its `VOICEVOX:<character>` credit.

Microphone audio and selected imported samples are sent to the analysis service for measurement. The analyzer does not save uploaded audio. Completed recordings and user-imported libraries are stored in the browser; clearing site data removes them.

## Verification

```sh
bun run check:all
```

The default check type-checks the app and tests, lints the repository, builds the
production app once, then runs the unit tests and focused browser flows in
`e2e/flows`. The browser checks use recorded API responses and public audio fixtures;
they need no analyzer, Python environment or model downloads. On machines with
`devrun`, use `devrun bun run check:all` to contain the test server and browser.

For a targeted change, run the relevant tests directly:

```sh
bun run test:unit tests/unit/storage.test.ts
bun run build
bun run test:e2e studio.spec.ts --grep 'uploaded audio'
```

Browser assertions cover playable references in every language, language navigation,
saved preferences, recording and cancellation, take persistence, rename, export and
deletion, recovery from failed analysis, sharing, mobile controls, page rendering and
the first-visit guide. Add a focused assertion for each changed behavior or bug fix.
Use unit tests for calculations, storage rules and other logic that can be checked
without a browser. The numerical and storage fixtures in `tests/golden/unit` remain
regression tests; update them only when their expected outputs intentionally change.

Whole-page DOM, request-order and pixel comparisons from the HTML-to-SvelteKit
migration live in `e2e/scenarios` and `tests/golden/{e2e,canvas}`. They are historical
reference material, excluded from `check:all` and `test:e2e`. Ordinary UI and copy PRs
do not need to refresh them. To investigate a particular migration-era behavior or
compare a layout with a recorded image:

```sh
bun run build
bun run test:e2e:characterization takes.spec.ts
bun run test:e2e:visual --grep 'dark phone'
```

These comparisons can fail after intentional product changes. Inspect the relevant
diff; a failing historical comparison alone does not block a PR. New regression
coverage belongs in `e2e/flows` with explicit expected outcomes. See
[e2e/CONTRACT.md](e2e/CONTRACT.md) for the comparison format and update commands.

`bun run test:coverage` builds with source maps, runs unit tests and browser flows
with V8 coverage, then writes per-layer reports under `coverage/`. Use those reports
to find untested behavior. Coverage has no global percentage gate or line-number
exclusion list. This command leaves a coverage build in `.svelte-kit/cloudflare`;
run `bun run build` before ordinary browser checks. `build:public` always rebuilds
before deployment.

Additional checks depend on the change:

- `bun run build:public` and `bun run check:worker` check the deployment set and
  Worker types. `.venv/bin/python tests.py` runs acoustic regressions against local
  controlled audio fixtures, which are not published.
- `bun run check:live` checks deployed routes against `tests/golden/live/routes.json`.
  Use `node --experimental-strip-types e2e/live/routes.ts <url>` for a preview.
  The mock server does not run `worker.ts`, so deployment routing needs this check.
- `e2e/model/explore.ts` and `compare.ts` inspect reachable UI states on demand.
  Model exploration is outside the PR checks and can take half an hour or more.

`tests/fixtures/data` is built from a prepared public data set with
`tests/scripts/build-fixture-data.mjs`; `tests/fixtures/audio/SOURCES.md` documents
the audio sources. Refresh API fixtures only when the API contract changes.

## Acknowledgments

The comparison workflow draws on [Acoustic Gender Space](https://acousticgender.space/), [Phonia](https://phonia.app/), and [InFormant](https://in-formant.app/). The app is independently developed.

For Chinese-language practice material, see [あおぎ葵’s MTF声音女性化练习手册](https://www.bilibili.com/opus/546442165017071774), a community guide covering source–filter concepts and Praat examples. Measurement definitions are documented on the app’s method page.
