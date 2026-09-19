// Functions serialized into the page: they must be self-contained.

export type Observation = {
	url: string;
	title: string;
	lang: string;
	theme: string | null;
	dialogs: string[];
	focus: string | null;
	vars: Record<string, string>;
	elements: Record<string, unknown>;
	storage?: unknown;
};

export function domProjection(): Observation {
	// Class names that carry meaning for the tests (state, kind of row) rather than
	// styling; a rewrite may add its own classes, only these are compared. The list lives
	// inside the function because the function is serialised into the page.
	const contractClasses = new Set([
		'sample-row',
		'speaker-folder',
		'speaker-more',
		'favorite',
		'indicator',
		'error',
		'toast',
		'active',
		'live-button',
		'record-button',
		'list-item',
		'scale',
		'scale-group'
	]);
	const collapse = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
	// The text of a node is its non-empty text nodes, each collapsed and trimmed, joined by
	// one space: the same string whether the markup is written on one line or formatted,
	// since the whitespace between text nodes is not content.
	const text = (node: Node | null | undefined) => {
		if (!node) return '';
		const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
		const parts: string[] = [];
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const part = collapse(n.textContent);
			if (part) parts.push(part);
		}
		return parts.join(' ');
	};
	const attrs = (el: Element) => {
		const out: Record<string, string> = {};
		for (const a of el.attributes)
			if (
				/^(aria-|data-|role$|hidden$|disabled$|open$|href$|title$|placeholder$|lang$|type$|min$|max$|step$|tabindex$|checked$|selected$|for$|src$|download$|target$|rel$)/.test(
					a.name
				)
			)
				out[a.name] = a.value.replace(/^blob:.*/, 'blob:');
		return out;
	};
	const elements: Record<string, unknown> = {};
	for (const el of document.querySelectorAll('[id]')) {
		// The framework's own live region (SvelteKit's announcer) is not the app's DOM.
		if (el.id === 'svelte-announcer') continue;
		const id = el.id;
		const entry: Record<string, unknown> = {
			tag: el.tagName.toLowerCase(),
			class: [...el.classList]
				.filter((c) => contractClasses.has(c))
				.sort()
				.join(' '),
			attrs: attrs(el)
		};
		if (el instanceof HTMLInputElement) {
			entry.value = el.value;
			if (el.type === 'checkbox' || el.type === 'radio') entry.checked = el.checked;
			if (el.type === 'file') entry.files = el.files?.length || 0;
		} else if (
			el instanceof HTMLTextAreaElement ||
			el instanceof HTMLSelectElement ||
			el instanceof HTMLOutputElement
		)
			entry.value = el.value;
		if (el instanceof HTMLDialogElement) entry.open = el.open;
		if (el instanceof HTMLMediaElement)
			entry.media = {
				src: el.getAttribute('src')
					? el.src.startsWith('blob:')
						? 'blob:'
						: el.getAttribute('src')
					: null,
				paused: el.paused,
				rate: el.playbackRate,
				volume: el.volume,
				muted: el.muted,
				loop: el.loop
			};
		if (el.tagName === 'KOE-SELECT') {
			const k = el as HTMLElement & { value?: string; options?: HTMLOptionElement[] };
			entry.value = k.value;
			entry.options = [...el.querySelectorAll(':scope > option')].map((o) => ({
				value: (o as HTMLOptionElement).value,
				text: text(o),
				disabled: (o as HTMLOptionElement).disabled,
				data: Object.fromEntries(
					[...o.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value])
				)
			}));
			entry.trigger = text(el.shadowRoot?.querySelector('.trigger'));
			entry.expanded = el.shadowRoot?.querySelector('.trigger')?.getAttribute('aria-expanded');
			// Row actions of an open menu (the recording history): each button's action, value,
			// title and disabled state, so a replay in progress shows as its stop button.
			if (entry.expanded === 'true') {
				const actions = [...(el.shadowRoot?.querySelectorAll('.row-action') || [])].map(
					(b) =>
						`${(b as HTMLElement).dataset.value}:${(b as HTMLElement).dataset.action}:${b.getAttribute('title')}${(b as HTMLButtonElement).disabled ? ':disabled' : ''}`
				);
				if (actions.length) entry.rowActions = actions;
			}
		}
		const rows = el.querySelectorAll(':scope > *');
		if (id === 'sample-list') {
			const lines = [
				...el.querySelectorAll('.speaker-folder, .sample-row, button, details, summary')
			].map(
				(r) =>
					`${r.tagName.toLowerCase()}#${(r as HTMLElement).dataset.id || (r as HTMLElement).dataset.speaker || ''}|${r.className}|${r.getAttribute('aria-pressed') || ''}|${(r as HTMLDetailsElement).open ?? ''}|${text(r).slice(0, 80)}`
			);
			entry.rows = { count: lines.length, head: lines.slice(0, 40), tail: lines.slice(-5) };
		} else if (rows.length > 40) entry.children = rows.length;
		else entry.text = text(el).slice(0, 600);
		// Inline styles are compared only through their custom properties (how the app
		// passes values to CSS); --mic-level follows the live microphone signal and is masked.
		if (el instanceof HTMLElement && el.style.length) {
			const custom: Record<string, string> = {};
			for (const name of el.style)
				if (name.startsWith('--'))
					custom[name] = name === '--mic-level' ? '<live>' : el.style.getPropertyValue(name).trim();
			if (Object.keys(custom).length) entry.style = custom;
		}
		elements[id] = entry;
	}
	// The seek slider and the clocks show media time, which depends on how long audio
	// really played before a pause; they are replaced by a marker, and scenarios assert
	// them directly after a deterministic seek.
	for (const id of ['reference-seek', 'reference-time', 'timer', 'live-time'])
		if (elements[id]) elements[id] = { followsPlayback: true };
	// The live button embeds the elapsed capture time in its text.
	if (elements['live-mode'])
		(elements['live-mode'] as Record<string, unknown>).text = String(
			(elements['live-mode'] as Record<string, unknown>).text
		).replace(/\d+:\d\d$/, '<time>');
	const cs = getComputedStyle(document.documentElement);
	const vars: Record<string, string> = {};
	for (const name of ['--reference', '--self', '--accent'])
		vars[name] = cs.getPropertyValue(name).trim();
	const root = document.documentElement;
	return {
		url: location.pathname + location.search + location.hash,
		title: document.title,
		lang: root.lang,
		theme: root.dataset.theme ?? null,
		dialogs: [...document.querySelectorAll('dialog[open]')].map(
			(d) => d.id || d.className.split(' ')[0]
		),
		focus: document.activeElement?.id || document.activeElement?.tagName.toLowerCase() || null,
		vars,
		elements
	};
}

export async function storageDump() {
	const local: Record<string, unknown> = {};
	try {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i)!;
			const raw = localStorage.getItem(key)!;
			try {
				local[key] = JSON.parse(raw);
			} catch {
				local[key] = raw;
			}
		}
	} catch {
		local.$error = 'unavailable';
	}
	const hex = (buffer: ArrayBuffer) =>
		[...new Uint8Array(buffer)].map((n) => n.toString(16).padStart(2, '0')).join('');
	// Long strings (spectrogram images) and long numeric arrays (tracks, waveforms) are
	// kept as a hash plus length: exact, but small enough to review.
	const digest = async (text: string) =>
		hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
	const describe = async (value: unknown): Promise<unknown> => {
		if (typeof value === 'string' && value.length > 256)
			return { $string: value.length, sha256: await digest(value) };
		if (
			Array.isArray(value) &&
			value.length > 64 &&
			value.every(
				(v) => typeof v === 'number' || (Array.isArray(v) && v.every((n) => typeof n === 'number'))
			)
		)
			return { $numbers: value.length, sha256: await digest(JSON.stringify(value)) };
		if (value instanceof Blob)
			return {
				$blob: value.type,
				bytes: value.size,
				sha256: hex(await crypto.subtle.digest('SHA-256', await value.arrayBuffer()))
			};
		if (ArrayBuffer.isView(value))
			return {
				$typed: value.constructor.name,
				length: (value as unknown as ArrayLike<number>).length,
				sha256: hex(await crypto.subtle.digest('SHA-256', value as BufferSource))
			};
		if (Array.isArray(value)) return Promise.all(value.map(describe));
		if (value && typeof value === 'object')
			return Object.fromEntries(
				await Promise.all(
					Object.keys(value)
						.sort()
						.map(async (k) => [k, await describe((value as Record<string, unknown>)[k])])
				)
			);
		return value;
	};
	const idb: Record<string, unknown> = {};
	// A browser without IndexedDB (a startup scenario removes it) has no databases.
	const databases =
		(await (globalThis as { indexedDB?: IDBFactory }).indexedDB?.databases?.().catch(() => [])) ??
		[];
	if (databases.some((d) => d.name === 'koe-takes')) {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const r = indexedDB.open('koe-takes');
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
		if (db.objectStoreNames.contains('session')) {
			const store = db.transaction('session').objectStore('session');
			const [keys, values] = await Promise.all([
				new Promise<IDBValidKey[]>((resolve) => {
					const r = store.getAllKeys();
					r.onsuccess = () => resolve(r.result);
				}),
				new Promise<unknown[]>((resolve) => {
					const r = store.getAll();
					r.onsuccess = () => resolve(r.result);
				})
			]);
			for (let i = 0; i < keys.length; i++) idb[keys[i] as string] = await describe(values[i]);
		}
		db.close();
	}
	return { local, idb };
}

// What derives from captured microphone samples, masked: the fake device loops its file
// from launch, so a recording's samples differ between runs. The sample-dependent fields
// of stored recordings, the session's take and the waveform previews of the take menu are
// replaced by a marker; the analysis request bodies are the harness's to mask. Runs in
// the test process, not in the page.
export const MASKED_AUDIO = '<audio>';
export function maskAudio(observation: Observation): void {
	const strip = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(strip);
		if (value && typeof value === 'object')
			return Object.fromEntries(
				Object.entries(value).map(([k, v]) => [
					k,
					k === 'waveform' ||
					k === 'peaks' ||
					k === 'data-peaks' ||
					(['sha256', 'duration', 'length'].includes(k) && v !== null && typeof v !== 'object')
						? MASKED_AUDIO
						: strip(v)
				])
			);
		return value;
	};
	const storage = observation.storage as
		| { idb: Record<string, unknown>; local: Record<string, unknown> }
		| undefined;
	if (storage) {
		for (const key of Object.keys(storage.idb))
			if (key.startsWith('recording') || key === 'takes')
				storage.idb[key] = strip(storage.idb[key]);
		if (storage.local['koenami-session'])
			storage.local['koenami-session'] = strip(storage.local['koenami-session']);
	}
	const elements = observation.elements;
	if (elements['take-select']) elements['take-select'] = strip(elements['take-select']);
}
