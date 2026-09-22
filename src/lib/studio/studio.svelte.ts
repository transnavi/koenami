import type { Scorer } from '$lib/score';
import type { Side } from '$lib/signals';
/* The studio's reactive state. During the component refactor this replaces the plain `state`
   object the controller (app.ts) held with a Svelte 5 runes store of the same shape, so
   components can read it reactively while the controller keeps writing it. The controller still
   assembles the `window.voiceApp` test seam from this `state` plus its own closure.

   Field runes are chosen by how the controller writes each field:
   - `$state.raw` for the heavy payloads it reassigns wholesale (clips, detail, PCM, takes,
     the live track). Not proxied — no per-property signal allocation on hot paths, no split
     between a raw closure reference and the stored value, and plain objects that IndexedDB can
     structured-clone directly. A raw field's *contents* are not tracked: `clips[i].index` is
     patched in place at load (app.ts), so a future `{#each state.clips}` must key off a
     reassignment, not an in-place field write.
   - `$state` for the small records it mutates in place (`ranges.own = …`, the tokens).
   - `SvelteSet` for `analyzing`, since a plain Set behind `$state` is not reactive.

   One studio mounts per page; concurrent `mountStudio()` calls in one document are not
   supported (the second `reset()` clears the first). */
import { SvelteSet } from 'svelte/reactivity';

import type { Clip, Detail, PCM, Snapshot, Take, Words } from './types';

export class StudioState {
	lang = $state('ja');
	ownLanguage = $state('ja');
	languageToken = $state(0);
	loadingLanguage = $state(false);
	clips = $state.raw<Clip[]>([]);
	representatives = $state.raw<Clip[]>([]);
	selected = $state.raw<Clip | null>(null);
	own = $state.raw<Detail | null>(null);
	ownFull = $state.raw<Detail | null>(null);
	ownPCM = $state.raw<PCM | null>(null);
	ownName = $state('');
	ownId = $state<string | null>(null);
	ref = $state.raw<Detail | Clip | null>(null);
	refFull = $state.raw<Detail | null>(null);
	refPCM = $state.raw<PCM | null>(null);
	ranges = $state<Record<Side, [number, number] | null>>({ own: null, ref: null });
	words = $state<Record<Side, Words | null>>({ own: null, ref: null });
	custom = $state.raw<Clip[]>([]);
	imported = $state.raw<Clip[]>([]);
	takes = $state.raw<Take[]>([]);
	recording = $state(false);
	busy = $state(false);
	limit = $state(60);
	detailToken = $state(0);
	ownToken = $state(0);
	rangeToken = $state<Record<Side, number>>({ own: 0, ref: 0 });
	wordToken = $state<Record<Side, number>>({ own: 0, ref: 0 });
	liveTrack = $state.raw<{ t: number; [key: string]: unknown }[]>([]);
	liveClock = $state<{ end: number; at: number; start: number } | null>(null);
	readonly analyzing = new SvelteSet<string>();
	capabilities = $state<{ maxSeconds?: number; words?: boolean } | undefined>(undefined);
	scorer = $state.raw<Scorer | undefined>(undefined);
	captureMode = $state<'record' | 'live' | null>(null);
	previousTake = $state.raw<Snapshot | null>(null);
	ownTakeId = $state<string | null>(null);

	/* Restore every field to its initial value. Called on each mount so a remount under HMR, or
	   a second page in one document, starts clean. Copying a fresh instance's fields keeps this
	   total by construction — a new field inherits its declared initial value with no reset line
	   to forget — except `analyzing`, whose SvelteSet identity (held by the seam and future
	   components) must survive; it is cleared instead of replaced. */
	reset() {
		const { analyzing: _keep, ...fresh } = new StudioState();
		Object.assign(this, fresh);
		this.analyzing.clear();
	}
}

/* The one reactive state instance the studio runs on. The controller reads and writes it as it
   did the old local object; components will `$derive` from it as regions move over. */
export const state = new StudioState();

/* The state shape, for annotations elsewhere (`State['capabilities']`). */
export type State = StudioState;

/* A plain deep copy of reactive state, for values that leave Svelte's world for IndexedDB —
   `structuredClone` cannot clone a `$state` proxy. With `$state.raw` payloads only the small
   `ranges`/`words`/token records are proxied, but a snapshot can still carry one, so persisted
   pairs pass through here. `$state.snapshot` unwraps proxies but does not guarantee the result
   is cloneable, and it deep-copies typed arrays (the PCM), so keep it at the persistence
   boundary only. */
export const snapshot = <T>(value: T): T => $state.snapshot(value) as T;
