// A query string gives a second, uncached instance of the module (see corpus-import.test.ts).
declare module '@app/corpus-import?index-failure' {
	export * from '@app/corpus-import';
}
declare module '@app/space?no-window' {
	export * from '@app/space';
}
// The browser engine exists only in the Kit tree, and its module resolves `$lib` and a
// `?worker` import that this program does not know; the alias carries its signature.
declare module '@app/measure/engine' {
	type Detail = import('../../src/lib/studio/types').Detail;
	type PCM = import('../../src/lib/studio/types').PCM;
	export function analyze(pcm: PCM, signal?: AbortSignal): Promise<Detail>;
	export function live(pcm: PCM, signal?: AbortSignal): Promise<Detail>;
	export function mono16(
		samples: Float32Array,
		channels: number,
		rate: number,
		signal?: AbortSignal
	): Promise<PCM>;
	export function version(): Promise<string>;
	export function stop(): void;
	type Kind = 'analyze' | 'live';
	export const gate: {
		hold(kind?: Kind): () => void;
		fail(message: string, kind?: Kind, times?: number): void;
		restore(kind?: Kind): void;
		patch(kind: Kind, fn: ((detail: Detail) => Detail) | null): void;
	};
}
