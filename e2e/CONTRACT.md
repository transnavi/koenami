# What the browser goldens require of a rewrite

Every value in `tests/golden/e2e` is a requirement on the rewritten app. This is the
list of what is meant to be a requirement and what is incidental, so that the goldens
stay evidence when the SvelteKit tree replaces `web/`.

## Intended

- **Element ids.** Every element with an `id` is projected (`e2e/observe.ts`): tag,
  the attributes listed there (`aria-*`, `data-*`, `role`, `hidden`, `disabled`,
  `open`, `href`, `title`, `placeholder`, `lang`, `type`, `min`/`max`/`step`,
  `tabindex`, `checked`/`selected`, `for`, `src`, `download`, `target`, `rel`), form
  values, dialog open state, media element state, and text. Keep the ids and these
  attributes; a rewrite may wrap them in any markup.
- **Contract classes** (the `contractClasses` list in `e2e/observe.ts`): `sample-row`,
  `speaker-folder`, `speaker-more`, `favorite`, `indicator`, `error`, `toast`,
  `active`, `live-button`, `record-button`, `list-item`, `scale`, `scale-group`.
  Other classes (including framework-scoped ones) are ignored.
- **Custom properties set inline** (`--reference`, `--mic-level`), and the computed
  values of `--reference`, `--self`, `--accent` on the root.
- **koe-select**: the element stays a custom element whose light-DOM `<option>`s carry
  the choices, whose shadow root has a `.trigger` button and `.item[data-value]`
  buttons in a popover, and whose row actions are `.row-action[data-value][data-action]`.
- **The sample list**: `details.speaker-folder[data-speaker]` containing
  `button.sample-row[data-id]` rows with a `.favorite` button each.
- **Storage**: the `localStorage` keys `koenami-session`, `voice-favorites`,
  `voice-speed`, `voice-theme`, `koenami-review` with their current shapes; the
  IndexedDB database `koe-takes` with its `session` store and the keys `takes`,
  `recording-index`, `recording:<uuid>`, `references`, `jvs-index`, `jvs-audio:<id>`.
  User data must survive the rewrite, so these are pinned exactly.
- **Requests**: method, path, sorted query and body hash of every `/api/*` and
  `/data/*` request, in order. The order is deliberate (catalog before library before
  detail); a rewrite that fetches concurrently changes behaviour the user can see
  (which data arrives first) and must be a conscious golden change.
- **Downloads**: file names and the bytes of exported WAV, JSON and HTML.
- **Canvases**: the PNG each canvas encodes itself (`toDataURL`), pixel-exact on this
  machine's Chromium build (`tests/golden/META.json` records the Playwright version and
  browser); the drawing code is ported as it is. Controls laid over a canvas are not
  part of its golden.
- **Error and notice text**, in Japanese, exactly as today.
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

## Incidental (not compared)

- Elements the framework owns (SvelteKit's `#svelte-announcer` live region), class names outside the contract list, inline styles other than custom properties,
  attribute order, whitespace, the number of range requests for media files
  (`media` lists the files touched), and the exact request timing.
- Values that follow real media time or microphone content: seek positions and clocks,
  captured-sample hashes and lengths, live readouts. They appear as
  `followsPlayback`, `<audio>` or `ignored` markers in the goldens.
