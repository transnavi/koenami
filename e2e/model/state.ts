// The studio as a state machine: the abstract state a page is in, and the operations it
// offers there. Both functions are serialised into the page (self-contained, no imports).
// The abstract state is coarse on purpose: it names what a user would call the situation
// (what is loaded, what is running, what is open), not every measurement, so that the
// explorer finds the same state again after different paths and the graph stays finite.
// The full DOM projection is compared at every node besides.

export type AbstractState = {
	lang: string;
	theme: string;
	phase: 'loading' | 'busy' | 'recording' | 'analysing' | 'idle';
	reference: 'none' | 'selected' | 'playing';
	own: 'none' | 'loaded' | 'analysed';
	takes: number;
	ranges: { own: boolean; ref: boolean };
	words: { own: boolean; ref: boolean };
	live: boolean;
	dialogs: string[];
	menu: string | null;
	sheet: boolean;
	view: string | null;
	toggles: string[];
	share: 'disabled' | 'ready';
};

type App = {
	state: {
		lang: string;
		loadingLanguage: boolean;
		busy: boolean;
		recording: boolean;
		analyzing: { size: number };
		selected: { id: string } | null;
		refFull: unknown;
		own: unknown;
		ownFull: unknown;
		ownPCM: unknown;
		takes: unknown[];
		ranges: { own: unknown; ref: unknown };
		words: { own: unknown; ref: unknown };
		liveTrack: unknown[];
		live?: boolean;
	};
};

export function abstractState(): AbstractState {
	const app = (window as unknown as { voiceApp?: App }).voiceApp;
	const s = app?.state;
	const dialogs = [...document.querySelectorAll('dialog[open]')].map(
		(d) => d.id || d.className.split(' ')[0] || 'dialog'
	);
	const menu =
		[...document.querySelectorAll('koe-select')].find(
			(k) => k.shadowRoot?.querySelector('button.trigger[aria-expanded="true"]') !== null
		)?.id ?? null;
	const value = (id: string) =>
		(document.getElementById(id) as (HTMLElement & { value?: string }) | null)?.value ?? null;
	const player = document.getElementById('reference-player') as HTMLMediaElement | null;
	const phase =
		!s || s.loadingLanguage
			? 'loading'
			: s.recording
				? 'recording'
				: s.busy
					? 'busy'
					: s.analyzing.size > 0
						? 'analysing'
						: 'idle';
	return {
		lang: document.documentElement.lang,
		theme: document.documentElement.dataset.theme || 'system',
		phase,
		reference: !s?.selected ? 'none' : player && !player.paused ? 'playing' : 'selected',
		own: !s?.ownPCM && !s?.own ? 'none' : s?.ownFull ? 'analysed' : 'loaded',
		takes: s?.takes?.length ?? 0,
		ranges: { own: !!s?.ranges?.own, ref: !!s?.ranges?.ref },
		words: { own: !!s?.words?.own, ref: !!s?.words?.ref },
		live:
			(s?.liveTrack?.length ?? 0) > 0 ||
			document.getElementById('live-mode')?.classList.contains('active') === true,
		dialogs,
		menu,
		sheet: (document.getElementById('sample-browser') as HTMLDialogElement | null)?.open === true,
		view: value('signal-view'),
		// The pressed controls (map projection, signal side, A/B, auto-rotate, favourite,
		// words, live) by id; the ids are the contract's.
		toggles: [
			...document.querySelectorAll<HTMLElement>(
				'button[id][aria-pressed="true"], button[id].active'
			)
		]
			.map((b) => b.id)
			.sort(),
		share:
			(document.getElementById('share-button') as HTMLButtonElement | null)?.disabled === false
				? 'ready'
				: 'disabled'
	};
}

export type Operation =
	| { kind: 'click'; id: string }
	| { kind: 'key'; key: string }
	| { kind: 'upload'; id: string; file: string }
	| { kind: 'choose'; id: string; value: string }
	| { kind: 'row'; index: number }
	| { kind: 'dismiss' };

export const operationName = (op: Operation) =>
	op.kind === 'click'
		? `click #${op.id}`
		: op.kind === 'key'
			? `key ${op.key === ' ' ? 'Space' : op.key}`
			: op.kind === 'upload'
				? `upload ${op.file} → #${op.id}`
				: op.kind === 'choose'
					? `choose #${op.id} = ${op.value}`
					: op.kind === 'row'
						? `pick sample row ${op.index}`
						: 'dismiss (click the page)';

// Every operation the page offers in its current state: the enabled, visible controls
// with an id (buttons, file inputs), the options of the open custom select, the first
// sample row, and the keys the page listens for. Controls that leave the page (the
// language select, the brand link) or open the operating system (import folders) are
// left out; the explorer's operation set is what a user can do without leaving.
export function enabledOperations(): Operation[] {
	const ops: Operation[] = [];
	const visible = (el: Element) => {
		const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return false;
		const style = getComputedStyle(el);
		return style.visibility !== 'hidden' && style.pointerEvents !== 'none';
	};
	const topDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
	const scope: ParentNode = topDialog ?? document;
	const skip = new Set([
		'tour-restart',
		'jvs-download',
		'import-audio',
		'share-system',
		'share-open'
	]);
	const openMenu = [...document.querySelectorAll('koe-select')].find(
		(k) => k.shadowRoot?.querySelector('button.trigger[aria-expanded="true"]') !== null
	);
	if (openMenu) {
		for (const item of openMenu.shadowRoot!.querySelectorAll('button.item[data-value]'))
			if (!(item as HTMLButtonElement).disabled)
				ops.push({ kind: 'choose', id: openMenu.id, value: (item as HTMLElement).dataset.value! });
		ops.push({ kind: 'key', key: 'Escape' });
		return ops;
	}
	for (const el of scope.querySelectorAll<HTMLButtonElement>('button[id]')) {
		if (el.disabled || el.hidden || skip.has(el.id) || !visible(el)) continue;
		ops.push({ kind: 'click', id: el.id });
	}
	for (const el of scope.querySelectorAll<HTMLElement>('koe-select[id]')) {
		const trigger = el.shadowRoot?.querySelector<HTMLButtonElement>('button.trigger');
		if (!visible(el) || el.hasAttribute('disabled') || trigger?.disabled || el.id === 'language')
			continue;
		ops.push({ kind: 'click', id: el.id });
	}
	for (const el of scope.querySelectorAll<HTMLInputElement>('input[type="file"][id]'))
		if (!el.disabled && !topDialog && !el.webkitdirectory)
			ops.push({ kind: 'upload', id: el.id, file: 'own-a.wav' });
	if (!topDialog) {
		const rows = document.querySelectorAll('.sample-row');
		if (rows.length) ops.push({ kind: 'row', index: 0 });
		for (const key of ['Escape', ' ', 'r', 'ArrowRight']) ops.push({ kind: 'key', key });
	} else {
		ops.push({ kind: 'key', key: 'Escape' });
		ops.push({ kind: 'dismiss' });
	}
	return ops;
}
