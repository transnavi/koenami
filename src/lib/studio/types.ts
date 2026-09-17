import type { Features } from '$lib/space';
import type { TrackRow } from '$lib/map';

/* Mono 16 kHz samples; always backed by an ArrayBuffer so they can be posted as a request body. */
export type PCM = Float32Array<ArrayBuffer>;

/* The analyzer's answer for one recording, or the pending stand-in before it arrives. */
export type Detail = {
	duration: number;
	features: Features;
	track?: TrackRow[];
	visuals?: { waveform?: [number, number][]; spectrogram?: { data: string; frames: number; bins: number }; spectrum?: { db: number[]; hz_step: number } };
	analysisPending?: boolean;
	reason?: string | null;
	resonance_sensitivity_pct?: number;
	level_dbfs?: number;
	peak?: number;
	offset?: number;
	active?: boolean;
	[key: string]: unknown;
};
export type Clip = {
	id: string;
	speaker: string;
	group: string;
	features: Features;
	name?: string;
	text?: string;
	audio?: string;
	duration?: number;
	plotted?: boolean;
	synthetic?: boolean;
	language?: string;
	dataset?: string;
	index?: number;
	display_label?: string;
	native?: boolean;
	localLibrary?: boolean;
	source?: string;
	engine?: string;
	voice_label?: string;
	configuration?: Record<string, string>;
	detail?: Detail;
	pcm?: PCM | null;
	recordingId?: string;
	[key: string]: unknown;
};
export type Take = {
	id: string;
	name: string;
	date: string;
	features?: Features;
	duration?: number;
	language?: string;
	stored?: boolean;
	quality?: Record<string, number>;
	storedId?: string;
	pcm?: PCM;
	[key: string]: unknown;
};
export type Words = { words: { text: string; start: number; end: number }[]; pace?: number; pace_unit?: string };
export type Snapshot = {
	takeId: string | null;
	detail: Detail;
	measurement: Detail | null;
	range: [number, number] | null;
	words: Words | null;
	pcm: PCM | null;
	name: string;
	id: string | null;
	language: string;
	url: string | null;
	storedId?: string;
};
export type View = {
	lang?: string;
	group?: string;
	sort?: string;
	search?: string;
	reference?: string;
	referenceRange?: [number, number] | null;
	openSpeakers?: string[];
	dimension?: number;
	projection?: string;
	yaw?: number;
	tilt?: number;
	zoom?: number;
	camera?: number[];
	center?: number[];
	pan?: number[];
	autoRotate?: boolean;
	signal?: string;
	signalSource?: string;
	overlay?: boolean;
	liveShapeSeconds?: number;
};
