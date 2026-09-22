/* The studio's reactive state. During the component refactor this replaces the plain
   `state` object the controller (app.ts) held: it is the same shape, now a Svelte 5 rune
   so components can read it reactively while the controller keeps writing it. The controller
   still assembles the `window.voiceApp` test seam from this `state` plus its own closure. */
import type { Scorer } from '$lib/score';
import type { Side } from '$lib/signals';

import type { Clip, Detail, PCM, Snapshot, Take, Words } from './types';

export type State = {
	lang: string;
	ownLanguage: string;
	languageToken: number;
	loadingLanguage: boolean;
	clips: Clip[];
	representatives: Clip[];
	selected: Clip | null;
	own: Detail | null;
	ownFull: Detail | null;
	ownPCM: PCM | null;
	ownName: string;
	ownId: string | null;
	ref: Detail | Clip | null;
	refFull: Detail | null;
	refPCM: PCM | null;
	ranges: Record<Side, [number, number] | null>;
	words: Record<Side, Words | null>;
	custom: Clip[];
	imported: Clip[];
	takes: Take[];
	recording: boolean;
	busy: boolean;
	limit: number;
	detailToken: number;
	ownToken: number;
	rangeToken: Record<Side, number>;
	wordToken: Record<Side, number>;
	liveTrack: { t: number; [key: string]: unknown }[];
	liveClock: { end: number; at: number; start: number } | null;
	analyzing: Set<string>;
	capabilities?: { maxSeconds?: number; words?: boolean };
	scorer?: Scorer;
	captureMode?: 'record' | 'live' | null;
	previousTake?: Snapshot | null;
	ownTakeId?: string | null;
};

/* The initial studio state. A fresh object each call so a remount (HMR, a second page in
   one document) starts clean. */
export const createState = (): State => ({
	lang: 'ja',
	ownLanguage: 'ja',
	languageToken: 0,
	loadingLanguage: false,
	clips: [],
	representatives: [],
	selected: null,
	own: null,
	ownFull: null,
	ownPCM: null,
	ownName: '',
	ownId: null,
	ref: null,
	refFull: null,
	refPCM: null,
	ranges: { own: null, ref: null },
	words: { own: null, ref: null },
	custom: [],
	imported: [],
	takes: [],
	recording: false,
	busy: false,
	limit: 60,
	detailToken: 0,
	ownToken: 0,
	rangeToken: { own: 0, ref: 0 },
	wordToken: { own: 0, ref: 0 },
	liveTrack: [],
	liveClock: null,
	analyzing: new Set()
});

/* The one reactive state instance the studio runs on. The controller reads and writes it as
   before; components will `$derive` from it as regions move over. */
export const state: State = $state(createState());

/* A plain deep clone of reactive state, for values that leave Svelte's world — persisted to
   IndexedDB, which structured-clones its input and cannot clone a `$state` proxy. Typed arrays
   (PCM) pass through untouched. */
export const snapshot = <T>(value: T): T => $state.snapshot(value) as T;
