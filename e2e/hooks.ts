// Synchronization hooks shared by focused flows and historical migration scenarios.
// Prefer DOM assertions for the observable outcome once asynchronous work has settled.
export const app = {
	/** A reference library is loaded and the selected reference's analysis has arrived. */
	ready: '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage',
	/** No analysis or storage operation is running. */
	idle: '!window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0',
	/** Own audio is loaded and analysed, and nothing else is running. */
	analysed:
		'!!window.voiceApp?.state.ownFull && !window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0',
	busy: 'window.voiceApp.state.busy === true',
	recording: 'window.voiceApp.state.recording === true',
	stopped: 'window.voiceApp.state.recording === false',
	/** Own samples exist (a take was captured or uploaded). */
	ownSamples: '!!window.voiceApp.state.ownPCM',
	/** Exactly one analysis is running in the background. */
	oneAnalysing: 'window.voiceApp.state.analyzing.size === 1',
	notBusy: '!window.voiceApp.state.busy',
	referenceLoaded: '!!window.voiceApp.state.refFull',
	analysisPending: '!!window.voiceApp.state.ownFull?.analysisPending',
	ownName: (name: string) => `window.voiceApp.state.ownName === ${JSON.stringify(name)}`,
	ownNameStartsWith: (prefix: string) =>
		`window.voiceApp.state.ownName.startsWith(${JSON.stringify(prefix)})`,
	selected: (id: string) =>
		`window.voiceApp.state.selected?.id === ${JSON.stringify(id)} && !!window.voiceApp.state.refFull`,
	selectedId: (id: string) => `window.voiceApp.state.selected?.id === ${JSON.stringify(id)}`,
	selectedGroup: (group: string) =>
		`window.voiceApp.state.selected?.group === ${JSON.stringify(group)}`,
	selectedSynthetic: 'window.voiceApp.state.selected?.synthetic === true',
	languageLoaded: (id: string) =>
		`window.voiceApp?.state.lang === ${JSON.stringify(id)} && !window.voiceApp.state.loadingLanguage && !!window.voiceApp.state.refFull`,
	libraryLoaded: '!!window.voiceApp && !window.voiceApp.state.loadingLanguage',
	range: (side: 'own' | 'ref') => `!!window.voiceApp.state.ranges.${side}`,
	/** A selection exists and its analysis has replaced the displayed measurement. */
	rangeApplied: (side: 'own' | 'ref') =>
		`!!window.voiceApp.state.ranges.${side} && window.voiceApp.state.${side}?.offset === window.voiceApp.state.ranges.${side}[0]`,
	noRange: (side: 'own' | 'ref') => `!window.voiceApp.state.ranges.${side}`,
	noRanges: '!window.voiceApp.state.ranges.own && !window.voiceApp.state.ranges.ref',
	words: (side: 'own' | 'ref') => `!!window.voiceApp.state.words.${side}`,
	liveMeasured: 'window.voiceApp.state.liveTrack.length > 0',
	/** Seconds of microphone audio captured so far. */
	buffered: (seconds: number) => `window.voiceApp.captureDebug().bufferSeconds >= ${seconds}`,
	monitoring: 'window.voiceApp.captureDebug().monitoring',
	/** The verdict can be shared: the scorer is available and the take passed the gate. */
	shareReady: '!document.getElementById("share-button").disabled',
	shareImage: '!document.getElementById("share-image").hidden',
	/** Canvas position of a plotted sample, or null. */
	hit: (id: string) =>
		`(() => { const p = window.voiceApp.map.hit.find(h => h.sample.id === ${JSON.stringify(id)}); return p ? [p.xy[0], p.xy[1]] : null; })()`,
	historyHit:
		'(() => { const p = window.voiceApp.map.hit.find(h => h.sample.recordingId); return p ? [p.xy[0], p.xy[1]] : null; })()'
};

export const tour = {
	open: 'document.querySelector("dialog.tour-card[open]") !== null',
	closed: 'document.querySelector("dialog.tour-card[open]") === null',
	step: (n: number) =>
		`document.getElementById("tour-count")?.textContent?.startsWith(${JSON.stringify(String(n) + ' /')})`
};

export const pairs = {
	loaded: 'window.pairsApp && window.pairsApp.queue.length > 0',
	at: (index: number) => `window.pairsApp.at === ${index}`
};

export const review = {
	loaded: 'window.reviewApp && window.reviewApp.queue.length > 0',
	at: (index: number) => `window.reviewApp.at === ${index}`,
	finished: 'window.reviewApp.queue.length === window.reviewApp.at',
	mode: (mode: string) => `window.reviewApp && window.reviewApp.mode === ${JSON.stringify(mode)}`,
	modeLoaded: (mode: string) =>
		`window.reviewApp.mode === ${JSON.stringify(mode)} && window.reviewApp.queue.length > 0`,
	language: (id: string) =>
		`window.reviewApp.lang === ${JSON.stringify(id)} && window.reviewApp.queue.length > 0`
};
