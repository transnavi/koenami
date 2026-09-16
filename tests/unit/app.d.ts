// A query string gives a second, uncached instance of the module (see corpus-import.test.ts).
declare module '@app/corpus-import?index-failure' {
	export * from '@app/corpus-import';
}
declare module '@app/space?no-window' {
	export * from '@app/space';
}
