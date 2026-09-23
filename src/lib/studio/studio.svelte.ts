import type { Scorer } from '$lib/score';
import type { Side } from '$lib/signals';
/* The studio's reactive state. During the component refactor this replaces the plain `state`
   object the controller (app.ts) held with a Svelte 5 runes store of the same shape, so
   components can read it reactively while the controller keeps writing it. The controller still
   assembles the `window.voiceApp` test seam from this `state` plus its own closure.

   One instance is created per mount and shared through Svelte context (`provideStudio` in the
   `<Studio>` shell, `useStudio` in child components); the controller receives the same instance
   as an argument. A remount — HMR, or client-side navigation back to the page — therefore builds
   a fresh, already-clean instance, and an async callback still in flight from the previous mount
   writes into that previous (now-detached) instance rather than the live one, the isolation the
   old per-mount local object gave. (Removing the mount's `window`/audio listeners on unmount is a
   separate, pre-existing teardown gap, tracked outside this store.)

   Field runes are chosen by how the controller writes each field:
   - `$state.raw` for the heavy payloads it reassigns wholesale (clips, detail, PCM, takes,
     the live track). Not proxied — no per-property signal allocation on hot paths, no split
     between a raw closure reference and the stored value, and plain objects that IndexedDB can
     structured-clone directly. A raw field's *contents* are not tracked: `clips[i].index` is
     patched in place at load (app.ts), so a future `{#each state.clips}` must key off a
     reassignment, not an in-place field write.
   - `$state` for the small records it mutates in place (`ranges.own = …`, the tokens).
   - `SvelteSet` for `analyzing`, since a plain Set behind `$state` is not reactive. */
import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

import type { Clip, Detail, PCM, SimilarSpeaker, Snapshot, Take, Words } from './types';

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
	capabilities = $state<{ maxSeconds?: number; words?: boolean; similar?: string[] } | undefined>(
		undefined
	);
	/* Reference speakers ranked by the analyzer's timbre descriptor for one own take; `key`
	   names the take and its selection. Reassigned whole, so the map is not proxied. */
	similar = $state.raw<{ key: string; speakers: Map<string, SimilarSpeaker> } | null>(null);
	/* The ranking request in flight. */
	similarKey = $state<string | null>(null);
	/* The key whose ranking failed; it is not retried until the sort is chosen again. */
	similarFailed = $state<string | null>(null);
	scorer = $state.raw<Scorer | undefined>(undefined);
	captureMode = $state<'record' | 'live' | null>(null);
	previousTake = $state.raw<Snapshot | null>(null);
	ownTakeId = $state<string | null>(null);
}

/* The state shape, for annotations elsewhere (`State['capabilities']`). */
export type State = StudioState;

const STUDIO = Symbol('studio');

/* Create this mount's state and publish it on the component context. Called once in the
   `<Studio>` shell during its initialisation, before `mountStudio` runs. */
export function provideStudio(): StudioState {
	return setContext(STUDIO, new StudioState());
}

/* This mount's state, for child components. */
export function useStudio(): StudioState {
	return getContext<StudioState>(STUDIO);
}

/* A plain deep copy of reactive state, for values that leave Svelte's world for IndexedDB —
   `structuredClone` cannot clone a `$state` proxy. With `$state.raw` payloads only the small
   `ranges`/`words`/token records are proxied, but a snapshot can still carry one, so persisted
   pairs pass through here. `$state.snapshot` unwraps proxies but does not guarantee the result
   is cloneable, and it deep-copies typed arrays (the PCM), so keep it at the persistence
   boundary only. */
export const snapshot = <T>(value: T): T => $state.snapshot(value) as T;
