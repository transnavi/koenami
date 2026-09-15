# Koenami

Voice practice with audible references, a live acoustic map, and side-by-side measurements. Japanese comes first, followed by Mandarin, English, and Korean. Feminine, masculine, and androgynous voice goals are welcome.

[Public demo](https://koe.transnavi.jp/) · [Source](https://github.com/transnavi/koenami) · [MIT license](LICENSE)

- Record with **R**, play with **Space**, cancel with **Esc**.
- **Live** continuously plots microphone input. The headphones button enables microphone monitoring; headphones avoid acoustic feedback.
- Saved recordings remain available after refresh. Their averages appear on the map; the recording title opens the history and download menu.
- Compare pitch, resonance, harmonicity, spectral balance, and pitch variation. Orbit, pan, and scroll to zoom the 3D map. Use the dock for pitch, waveform, spectrum, and spectrogram comparisons.
- Browse references by speaker, favorite individual clips, and adjust playback speed without changing pitch.
- Import an official **JVS ZIP or extracted folder** through the sample library’s **＋** menu. Imports are verified against original-file checksums, saved in IndexedDB, and restored on refresh. A single speaker folder also works.

The current map uses speaker-balanced PCA of five acoustic measurements. It is not calibrated to listener judgments of gender, naturalness, or vocal quality. The underlying measurements can vary with phonetic content and recording conditions. See the app’s method page for definitions and limitations.

## Local development

Requires Node.js 22.12 or newer, Python 3.12, and [uv](https://docs.astral.sh/uv/).

```sh
npm ci
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
.venv/bin/python fetch_demo.py
npm run dev
```

Open `http://localhost:8766/ja/`. Vite provides HMR and proxies the Python analyzer on port 35511. Where `devrun` is available, launch with `devrun npm run dev` to cap resources and stop both services together.

`fetch_demo.py` downloads about 159 MB of reference audio from the public demo. The datasets are not included in this repository. To rebuild the larger local JVS collection, download the official archive into `research/jvs_ver1.zip`, then run `build_native.py` and `build_import_index.py`. The public-demo fetch supplies an import index without requiring a local copy of the full archive.

Optional word timing uses Whisper large-v3-turbo with CUDA and Sudachi. Install `requirements-asr.txt` and run `download_asr.py`. Optional VOICEVOX preparation uses `build_voicevox.py` with the separately installed VOICEVOX core, models, and dictionaries. These services are not required for the public demo.

## Public deployment

The frontend and approved sample files run on Cloudflare Workers Static Assets. A Cloudflare Container runs the same Python acoustic analyzer. The configuration permits one `basic` container, which sleeps after one minute idle. Public recordings are limited to one minute; failed analysis preserves the recording and offers retry from its title menu. GPU word timing is available only in the local setup.

```sh
npm run build:public
npm run check:worker
npx wrangler deploy
```

Configure your own Cloudflare account and hostname in `wrangler.jsonc` before deploying a fork. Docker must be running for the container build. Production deployments use `main`.

`prepare_public.py` creates an explicit deployment set in `.deploy/`. It copies only approved reference files and verifies their checksums. Private recordings, model weights, the full JVS archive, and research scratch files are excluded. The Docker context uses an allowlist as an additional boundary.

## Data and licenses

**The MIT license applies to the application code. Audio, transcripts, metadata, model weights, and dependencies retain their original licenses.**

The public demo includes 10 JVS clips under the author’s small-website-excerpt allowance, 3 reviewed Japanese Common Voice clips, 54 credited VOICEVOX clips, and Common Voice collections in Mandarin, English, and Korean. The Japanese JVS corpus documents native professional speakers. Native-speaker screening has not been completed for the other languages.

- [JVS terms](https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus): personal and noncommercial research use; full audio redistribution is restricted. JVS tags are CC BY-SA 4.0. The import index includes adapted metadata and computed acoustic measurements; it contains no audio.
- [Common Voice](https://commonvoice.mozilla.org/): CC0 audio collections. Clip-level manifests preserve the source and checksums.
- [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and [voice library terms](https://github.com/VOICEVOX/voicevox_vvm/blob/main/README.md): credit and character-specific conditions apply. Audio reuse must follow those terms.

VOICEVOX credits: 四国めたん、春日部つむぎ、雨晴はう、冥鳴ひまり、九州そら、中国うさぎ、玄野武宏、白上虎太郎、栗田まろん. Each sample displays its `VOICEVOX:<character>` credit.

Microphone audio and selected imported samples are sent to the analysis service for measurement. The analyzer does not save uploaded audio. Completed recordings and user-imported libraries are stored in the browser; clearing site data removes them.

## Verification

```sh
npm run build:public
npm run check:worker
.venv/bin/python demo_browser_test.py
```

The browser suite checks live monitoring, persistence, plotted recording history, recording limits, analysis failure recovery, JVS import and playback, selected-range analysis, and desktop/mobile layouts. It requires the official JVS archive for its small import fixture and a locally installed Playwright Chromium. `tests.py` contains additional acoustic regression checks against local controlled audio fixtures; those fixtures are not published.

## Acknowledgments

The comparison workflow draws on [Acoustic Gender Space](https://acousticgender.space/), [Phonia](https://phonia.app/), and [InFormant](https://in-formant.app/). Colors draw on [とらんすナビ](https://transnavi.jp/). The app is independently developed.
