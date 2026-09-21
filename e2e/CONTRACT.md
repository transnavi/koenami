# Browser checks

`e2e/flows` contains the browser checks used by `bun run check:all` and
`bun run test:e2e`. Each test asserts the outcome of a user action: a recording can
be played, a saved take survives reload, a failed analysis can be retried, or a
shared result opens. Keep expected values close to the behavior they describe.
Avoid serializing the whole page, all storage or a cumulative request log into a
new regression test. Copy changes should affect assertions about that copy only.

The suite runs against the minified production build and the replay server under
`tests/mock-api`. The server uses committed responses and public audio; normal
checks do not start an analyzer or rewrite fixtures. Build first with
`bun run build`. `E2E_PORT` selects a different port when another task is testing.
Use `devrun bun run test:e2e` where the resource wrapper is installed.

## Historical migration comparisons

`e2e/scenarios` and `tests/golden/{e2e,canvas}` record the behavior characterized
during the HTML-to-SvelteKit migration. They are available through
`bun run test:e2e:characterization [spec or --grep filter]`; the screenshots alone
run with `bun run test:e2e:visual [--grep filter]`. Both require a production build.
These checks are optional diagnostics. Their baselines may differ from current
product behavior, and routine PRs do not need to update them.

For a deliberate comparison baseline update, use recorded API responses:

```sh
bun run build
RECORD=1 bun run test:e2e:characterization takes.spec.ts --update-snapshots=all
```

Review the selected JSON and image diffs. `RECORD=1` writes JSON observations;
`--update-snapshots=all` writes images. Neither refreshes API responses.
`bun run test:characterization:record [spec]` additionally proxies the real analyzer
and records API fixtures; it requires the Python environment and models
(`KOENAMI_PYTHON` can select another interpreter). Use it only for an intentional
API fixture refresh. A full invocation replaces the historical baseline set.

The historical comparison fields are listed below. Storage compatibility and data
preservation are checked by unit tests and focused browser flows.

## Recorded fields

- **Element ids.** Every element with an `id` is projected (`e2e/observe.ts`): tag,
  the attributes listed there (`aria-*`, `data-*`, `role`, `hidden`, `disabled`,
  `open`, `href`, `title`, `placeholder`, `lang`, `type`, `min`/`max`/`step`,
  `tabindex`, `checked`/`selected`, `for`, `src`, `download`, `target`, `rel`), form
  values, dialog open state, media element state, and text. The projection ignores surrounding markup.
- **Contract classes** (the `contractClasses` list in `e2e/observe.ts`): `sample-row`,
  `speaker-folder`, `speaker-more`, `favorite`, `indicator`, `error`, `toast`,
  `active`, `live-button`, `record-button`, `list-item`, `scale`, `scale-group`.
  Other classes (including framework-scoped ones) are ignored.
- **Custom properties set inline** (`--reference`, `--mic-level`), and the computed
  values of `--reference`, `--self`, `--accent` on the root.
- **koe-select**: the recorded control is a custom element whose light-DOM `<option>`s carry
  the choices, whose shadow root has a `.trigger` button and `.item[data-value]`
  buttons in a popover, and whose row actions are `.row-action[data-value][data-action]`.
- **The sample list**: `details.speaker-folder[data-speaker]` containing
  `button.sample-row[data-id]` rows with a `.favorite` button each.
- **Storage**: the `localStorage` keys `koenami-session`, `voice-favorites`,
  `voice-speed`, `voice-theme`, `koenami-review` with their current shapes; the
  IndexedDB database `koe-takes` with its `session` store and the keys `takes`,
  `recording-index`, `recording:<uuid>`, `references`, `jvs-index`, `jvs-audio:<id>`.
  The migration comparisons pin these values exactly.
- **Requests**: method, path, sorted query and body hash of every `/api/*` and
  `/data/*` request, in order. The historical sequence is catalog, library, then detail. These comparisons
  include ordering even when concurrent requests would produce the same result.
- **Downloads**: file names and the bytes of exported WAV, JSON and HTML.
- **Canvases**: the PNG each canvas encodes itself (`toDataURL`), pixel-exact on the recorded
  Chromium build (`tests/golden/META.json` records the Playwright version and
  browser); the migration preserved the drawing code. Controls laid over a canvas are not
  part of its golden.
- **Error and notice text**, in Japanese, as recorded.
- **The test hooks** in `e2e/hooks.ts`: `window.voiceApp` on the studio page with
  `state.{refFull, loadingLanguage, busy, analyzing (a Set), ownFull, ownPCM, ownName,
  recording, selected, lang, ranges, words, liveTrack}`, `captureDebug()` returning
  `{bufferSeconds, monitoring}` and `map.hit` (plotted points with `sample` and `xy`);
  `window.reviewApp` on the review page with `queue`, `at`, `mode`, `lang`;
  `window.pairsApp` on the pairs page with `queue` and `at`. These are the only
  internals the suite reads.
- **The first-visit guide** keeps its `voice-tour` storage key (`{step}` while
  paused, `{done: true}` after); the harness marks it done before every scenario that
  is not about it.

## Fields omitted from comparison

- Elements the framework owns (SvelteKit's `#svelte-announcer` live region), class names outside the contract list, inline styles other than custom properties,
  attribute order, whitespace, the number of range requests for media files
  (`media` lists the files touched), and the exact request timing.
- Values that follow real media time or microphone content: seek positions and clocks,
  captured-sample hashes and lengths, live readouts. They appear as
  `followsPlayback`, `<audio>` or `ignored` markers in the goldens.
