// Functions serialized into the page: they must be self-contained.

export type Observation = {
	url: string; title: string; lang: string; theme: string | null;
	dialogs: string[]; focus: string | null; vars: Record<string, string>;
	elements: Record<string, unknown>;
	storage?: unknown;
};

export function domProjection(): Observation {
	const collapse = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim();
	const attrs = (el: Element) => {
		const out: Record<string, string> = {};
		for (const a of el.attributes) if (/^(aria-|data-|role$|hidden$|disabled$|open$|href$|title$|placeholder$|lang$|type$|min$|max$|step$|tabindex$|checked$|selected$|for$|src$|download$|target$|rel$)/.test(a.name)) out[a.name] = a.value;
		return out;
	};
	const elements: Record<string, unknown> = {};
	for (const el of document.querySelectorAll('[id]')) {
		const id = el.id;
		const entry: Record<string, unknown> = { tag: el.tagName.toLowerCase(), class: [...el.classList].sort().join(' '), attrs: attrs(el) };
		if (el instanceof HTMLInputElement) { entry.value = el.value; if (el.type === 'checkbox' || el.type === 'radio') entry.checked = el.checked; if (el.type === 'file') entry.files = el.files?.length || 0; }
		else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLOutputElement) entry.value = el.value;
		if (el instanceof HTMLDialogElement) entry.open = el.open;
		if (el instanceof HTMLMediaElement) entry.media = { src: el.getAttribute('src') ? (el.src.startsWith('blob:') ? 'blob:' : el.getAttribute('src')) : null, paused: el.paused, rate: el.playbackRate, volume: el.volume, muted: el.muted, loop: el.loop };
		if (el.tagName === 'KOE-SELECT') {
			const k = el as HTMLElement & { value?: string; options?: HTMLOptionElement[] };
			entry.value = k.value;
			entry.options = [...el.querySelectorAll(':scope > option')].map((o) => ({ value: (o as HTMLOptionElement).value, text: collapse(o.textContent), disabled: (o as HTMLOptionElement).disabled, data: Object.fromEntries([...o.attributes].filter((a) => a.name.startsWith('data-')).map((a) => [a.name, a.value])) }));
			entry.trigger = collapse(el.shadowRoot?.querySelector('.trigger')?.textContent || '');
			entry.expanded = el.shadowRoot?.querySelector('.trigger')?.getAttribute('aria-expanded');
		}
		const rows = el.querySelectorAll(':scope > *');
		if (id === 'sample-list') {
			const lines = [...el.querySelectorAll('.speaker-folder, .sample-row, button, details, summary')].map((r) => `${r.tagName.toLowerCase()}#${(r as HTMLElement).dataset.id || (r as HTMLElement).dataset.speaker || ''}|${r.className}|${r.getAttribute('aria-pressed') || ''}|${(r as HTMLDetailsElement).open ?? ''}|${collapse(r.textContent).slice(0, 80)}`);
			entry.rows = { count: lines.length, head: lines.slice(0, 40), tail: lines.slice(-5) };
		} else if (rows.length > 40) entry.children = rows.length;
		else entry.text = collapse(el.textContent).slice(0, 600);
		if (el instanceof HTMLElement && el.style.cssText) entry.style = el.style.cssText;
		elements[id] = entry;
	}
	const cs = getComputedStyle(document.documentElement);
	const vars: Record<string, string> = {};
	for (const name of ['--reference', '--self', '--accent', '--mic-level']) vars[name] = cs.getPropertyValue(name).trim();
	const root = document.documentElement;
	return {
		url: location.pathname + location.search + location.hash,
		title: document.title,
		lang: root.lang,
		theme: root.dataset.theme ?? null,
		dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.id),
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
			try { local[key] = JSON.parse(raw); } catch { local[key] = raw; }
		}
	} catch { local.$error = 'unavailable'; }
	const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((n) => n.toString(16).padStart(2, '0')).join('');
	const describe = async (value: unknown): Promise<unknown> => {
		if (value instanceof Blob) return { $blob: value.type, bytes: value.size, sha256: hex(await crypto.subtle.digest('SHA-256', await value.arrayBuffer())) };
		if (ArrayBuffer.isView(value)) return { $typed: value.constructor.name, length: (value as unknown as ArrayLike<number>).length, sha256: hex(await crypto.subtle.digest('SHA-256', value as BufferSource)) };
		if (Array.isArray(value)) return Promise.all(value.map(describe));
		if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.keys(value).sort().map(async (k) => [k, await describe((value as Record<string, unknown>)[k])])));
		return value;
	};
	const idb: Record<string, unknown> = {};
	const databases = await indexedDB.databases?.().catch(() => []) ?? [];
	if (databases.some((d) => d.name === 'koe-takes')) {
		const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('koe-takes'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
		if (db.objectStoreNames.contains('session')) {
			const store = db.transaction('session').objectStore('session');
			const [keys, values] = await Promise.all([
				new Promise<IDBValidKey[]>((resolve) => { const r = store.getAllKeys(); r.onsuccess = () => resolve(r.result); }),
				new Promise<unknown[]>((resolve) => { const r = store.getAll(); r.onsuccess = () => resolve(r.result); })
			]);
			for (let i = 0; i < keys.length; i++) idb[String(keys[i])] = await describe(values[i]);
		}
		db.close();
	}
	return { local, idb };
}
