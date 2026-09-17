/* Keyboard-first listening review. Every decision is appended to curation/reviews.jsonl
   through the local API (ported from web/review.js; <koe-select> provides its selects). */
import { defineKoeSelect } from './koe-select';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const KEYS: Record<string, string> = { no_speech: 'E', murmur: 'U', noise: 'Z', distorted: 'X' };
type ReviewClip = { id: string; display?: string; text?: string; duration?: number; audio: string };
type QueueItem = {
	speaker: string;
	clips: ReviewClip[];
	first: string;
	repeat?: string;
	previous?: { ratings: Record<string, number>; note: string };
	missing?: string[];
};
type Scale = {
	key: string;
	name: string;
	group: string;
	only?: string;
	decades?: boolean;
	ends?: string[];
};
type Anchor = { scale: string; value: string; display?: string; end: string; audio: string };
type Draft = {
	clip?: string;
	ratings: Record<string, number>;
	chosen?: string[];
	note?: string;
	active?: number;
	scope?: unknown;
};
type LogEntry = {
	display?: string;
	speaker?: string;
	flags?: string[];
	ratings?: Record<string, number>;
	note?: string;
};
type Saved = {
	lang?: string;
	mode?: string;
	pass?: string;
	skipped?: Record<string, string[]>;
	speaker?: string;
	drafts?: Record<string, Draft>;
	ratings?: Record<string, number>;
	clip?: string;
	chosen?: string[];
	scope?: unknown;
	note?: string;
	active?: number;
};
type State = {
	lang: string;
	mode: string;
	pass: string;
	session: string;
	drafts: Record<string, Draft>;
	queue: QueueItem[];
	flags: Record<string, string>;
	at: number;
	clip: number;
	ratings: Record<string, number>;
	chosen: Set<string>;
	active: number;
	log: LogEntry[];
	skipped: string[];
	offered?: string[];
	scales?: Scale[];
	anchors?: Anchor[];
	decades?: Record<string, string>;
	reviewed?: number;
};
/* Position, skipped speakers and the unsaved draft survive a reload; the review log itself lives on the server. */
const STORAGE = 'koenami-review';
// A session id groups one sitting. web/review.js meant to keep it for 40 minutes but read and
// wrote its storage before `STORAGE` was initialised, so every load began a new session; the
// goldens pin that, and keeping a session is a change for the review tool's own revision.
function sessionId() {
	const now = Date.now();
	return Math.random().toString(36).slice(2, 10) + now.toString(36);
}
export function mountReview() {
	defineKoeSelect();
	const state: State = {
		lang: 'ja',
		mode: 'new',
		pass: 'all',
		session: sessionId(),
		drafts: {},
		queue: [],
		flags: {},
		at: 0,
		clip: 0,
		ratings: {},
		chosen: new Set(),
		active: 0,
		log: [],
		skipped: []
	};
	function draftOf(): Draft {
		const item = current();
		return {
			clip: item?.clips[state.clip]?.id,
			ratings: state.ratings,
			chosen: [...state.chosen],
			note: $<HTMLTextAreaElement>('note').value,
			active: state.active
		};
	}
	// Unsaved answers are kept per speaker, so moving around the queue never loses them.
	function stash() {
		const item = current();
		if (item) state.drafts[item.speaker] = draftOf();
	}
	function remember() {
		stash();
		try {
			localStorage.setItem(
				STORAGE,
				JSON.stringify({
					lang: state.lang,
					mode: state.mode,
					pass: state.pass,
					skipped: { ...recall().skipped, [state.lang + ':' + state.mode]: state.skipped },
					speaker: current()?.speaker,
					drafts: state.drafts
				})
			);
		} catch {}
	}
	function recall(): Saved {
		try {
			const saved: Saved = JSON.parse(localStorage.getItem(STORAGE) as string) || {};
			if (saved.ratings && saved.speaker && !saved.drafts)
				saved.drafts = {
					[saved.speaker]: {
						clip: saved.clip,
						ratings: saved.ratings,
						chosen: saved.chosen,
						scope: saved.scope,
						note: saved.note,
						active: saved.active
					}
				};
			return saved;
		} catch {
			return {};
		}
	}
	const audio = new Audio();
	audio.loop = true;
	function setTheme(value: string) {
		try {
			localStorage.setItem('voice-theme', value);
		} catch {}
		document.documentElement.dataset.theme = value;
		$('theme-button')
			.querySelector('use')!
			.setAttribute('href', value === 'dark' ? '#i-sun' : '#i-moon');
	}
	$('theme-button').onclick = () =>
		setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
	$('theme-button')
		.querySelector('use')!
		.setAttribute('href', document.documentElement.dataset.theme === 'dark' ? '#i-sun' : '#i-moon');
	audio.onplay =
		audio.onpause =
		audio.onended =
			() => {
				$('play').setAttribute('aria-pressed', String(!audio.paused));
				$('play').textContent = audio.paused ? '▶' : '❚❚';
				$('play').setAttribute('aria-label', audio.paused ? '再生' : '一時停止');
			};

	async function load(saved: Saved = {}) {
		const r = await fetch(
			'/api/review?lang=' +
				encodeURIComponent(state.lang) +
				'&mode=' +
				state.mode +
				'&session=' +
				state.session
		);
		if (!r.ok) throw Error(await r.text());
		const data = await r.json();
		state.flags = data.flags;
		state.offered = data.offered;
		state.scales = data.scales;
		state.anchors = data.anchors || [];
		state.decades = data.ageDecades;
		state.log = data.log;
		state.reviewed = data.reviewed;
		// Skipped speakers move to the end of the queue instead of disappearing.
		state.skipped = (saved.skipped?.[state.lang + ':' + state.mode] || []).filter((sid) =>
			(data.queue as QueueItem[]).some((q) => q.speaker === sid)
		);
		state.queue = (data.queue as QueueItem[])
			.filter((q) => !state.skipped.includes(q.speaker))
			.concat(
				state.skipped.map((sid) => (data.queue as QueueItem[]).find((q) => q.speaker === sid)!)
			);
		state.drafts = { ...state.drafts, ...saved.drafts };
		state.at = Math.max(
			0,
			state.queue.findIndex((q) => q.speaker === saved.speaker)
		);
		for (const b of document.querySelectorAll<HTMLElement>('#mode button'))
			b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
		for (const b of document.querySelectorAll<HTMLElement>('#pass button'))
			b.setAttribute('aria-pressed', String(b.dataset.pass === state.pass));
		show();
	}
	function current(): QueueItem | undefined {
		return state.queue[state.at];
	}
	function scales() {
		return (state.scales || []).filter(
			(s) =>
				(!s.only || s.only === state.lang) &&
				(state.pass === 'all' ||
					s.group === state.pass ||
					(state.pass === '声質' && s.group === '話し方'))
		);
	}
	function show() {
		const item = current();
		$('card').hidden = !item;
		$('done').hidden = !!item;
		renderLog();
		$('progress').textContent = `済 ${state.reviewed}人 · 残り ${state.queue.length - state.at}人`;
		$('done').textContent =
			state.mode === 'update'
				? '追加項目が必要な話者はありません。'
				: 'この言語の話者はすべてレビュー済みです。';
		if (!item) {
			renderJump();
			remember();
			return;
		}
		// Re-reviews start from the speaker's previous answers; only rows the current scales added are still empty.
		const draft = state.drafts[item.speaker] || null;
		const base =
			draft ||
			(item.previous && {
				ratings: item.previous.ratings,
				chosen: [] as string[],
				note: item.previous.note,
				active: Math.max(
					0,
					scales().findIndex((s) => item.missing?.includes(s.key))
				)
			});
		state.clip = Math.max(
			0,
			item.clips.findIndex((c) => c.id === (draft?.clip || item.first))
		);
		state.ratings = { ...base?.ratings };
		state.chosen = new Set(base?.chosen || []);
		state.active = base?.active || 0;
		$<HTMLTextAreaElement>('note').value = base?.note || '';
		$('note').blur();
		$('status').textContent = '';
		$('speaker-meta').textContent = item.clips.length + '音声';
		renderClip();
		renderScales();
		renderFlags();
		renderAnchors();
		renderJump();
		remember();
		if (!draft) play();
	}
	const anchorAudio = new Audio();
	function renderAnchors() {
		const box = $('anchors');
		box.querySelectorAll('button').forEach((b) => b.remove());
		const list = state.anchors || [];
		box.hidden = !list.length || state.chosen.size > 0;
		list.forEach((a, i) => {
			const b = document.createElement('button');
			b.type = 'button';
			const name = state.scales!.find((s) => s.key === a.scale)?.name || a.scale;
			b.textContent = name + ' ' + a.value;
			const k = document.createElement('kbd');
			k.textContent = '⇧' + (i + 1);
			b.append(k);
			b.title = (a.display || '') + '（' + (a.end === 'low' ? '低い基準' : '高い基準') + '）';
			b.onclick = () => playAnchor(i);
			box.append(b);
		});
	}
	function playAnchor(i: number) {
		const a = (state.anchors || [])[i];
		if (!a) return;
		audio.pause();
		anchorAudio.src = a.audio;
		anchorAudio.loop = false;
		anchorAudio.currentTime = 0;
		anchorAudio.play().catch(() => {});
		$('anchors')
			.querySelectorAll('button')
			.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
		anchorAudio.onended = () => {
			$('anchors')
				.querySelectorAll('button')
				.forEach((b) => b.removeAttribute('aria-pressed'));
		};
	}
	function renderJump() {
		const filter = $<HTMLInputElement>('list-filter').value.trim().toLowerCase(),
			box = $('list-items');
		box.replaceChildren();
		state.queue.forEach((q, i) => {
			const label = (q.clips[0].display || q.speaker).replace(/^[FM]\s*/, '№ '),
				text = q.clips.find((c) => c.id === q.first)?.text || '';
			if (filter && !(label + ' ' + text).toLowerCase().includes(filter)) return;
			const b = document.createElement('button');
			b.type = 'button';
			b.className = 'list-item';
			b.dataset.index = String(i);
			b.setAttribute('aria-current', String(i === state.at));
			const name = document.createElement('strong');
			name.textContent = label;
			const mark = document.createElement('span');
			mark.className = 'mark';
			mark.textContent =
				i < state.at
					? '済'
					: state.drafts[q.speaker]
						? '途中'
						: state.skipped.includes(q.speaker)
							? '後回し'
							: '';
			const small = document.createElement('small');
			small.textContent = text;
			b.append(name, mark, small);
			b.onclick = () => {
				go(i);
				$<HTMLDialogElement>('list-dialog').close();
			};
			box.append(b);
		});
		$('list-count').textContent = state.queue.length + '人';
	}
	function openList() {
		renderJump();
		$<HTMLDialogElement>('list-dialog').showModal();
		$('list-filter').focus();
		requestAnimationFrame(() =>
			$('list-items').querySelector('[aria-current=true]')?.scrollIntoView({ block: 'center' })
		);
	}
	function go(i: number) {
		if (i < 0 || i >= state.queue.length || i === state.at) return;
		stash();
		state.at = i;
		show();
	}
	function renderClip() {
		const item = current()!,
			c = item.clips[state.clip];
		$('display').textContent = (c.display || item.speaker).replace(/^[FM]\s*/, '№ ');
		$('text').innerHTML = '';
		const t = document.createElement('span');
		t.textContent = c.text || '';
		const s = document.createElement('small');
		s.textContent = `${state.clip + 1}/${item.clips.length} · ${c.duration?.toFixed(1)} 秒`;
		$('text').append(t, s);
		audio.src = c.audio;
	}
	function play() {
		audio.currentTime = 0;
		audio.play().catch(() => {});
	}
	function toggle_play() {
		if (audio.paused) audio.play().catch(() => {});
		else audio.pause();
	}
	function step(d: number) {
		const item = current();
		if (!item) return;
		state.clip = (state.clip + d + item.clips.length) % item.clips.length;
		renderClip();
		remember();
		play();
	}
	function renderScales() {
		$('scales').replaceChildren();
		let group: string | null = null;
		scales().forEach((s, i) => {
			if (s.group !== group) {
				group = s.group;
				const h = document.createElement('div');
				h.className = 'scale-group';
				h.textContent = group;
				$('scales').append(h);
			}
			const row = document.createElement('div');
			row.className = 'scale';
			row.dataset.active = String(i === state.active);
			row.dataset.missing = String(!!current()?.missing?.includes(s.key));
			row.onclick = () => {
				state.active = i;
				renderScales();
				remember();
			};
			const name = document.createElement('span');
			name.className = 'name';
			name.textContent = s.name;
			row.append(name);
			const choices: [number, string][] = s.decades
				? Object.entries(state.decades!).map(([v, label]) => [Number(v), label])
				: Array.from({ length: 7 }, (_, v) => [v, String(v)]);
			{
				const steps = document.createElement('div');
				steps.className = 'steps';
				for (const [v, label] of choices) {
					const b = document.createElement('button');
					b.type = 'button';
					b.textContent = label;
					b.setAttribute('aria-pressed', String(state.ratings[s.key] === v));
					b.onclick = (e) => {
						e.stopPropagation();
						state.active = i;
						rate(v);
					};
					steps.append(b);
				}
				const out = document.createElement('output');
				out.textContent = Number.isFinite(state.ratings[s.key])
					? s.decades
						? state.decades![state.ratings[s.key]]
						: String(state.ratings[s.key])
					: '—';
				row.append(steps, out);
				if (s.ends) {
					const ends = document.createElement('div');
					ends.className = 'ends';
					for (const e of s.ends) {
						const span = document.createElement('span');
						span.textContent = e;
						ends.append(span);
					}
					row.append(ends);
				}
			}
			$('scales').append(row);
		});
	}
	function key(d: number) {
		const s = scales()[state.active];
		if (!s) return;
		if (s.decades) {
			const v = Object.keys(state.decades!).map(Number)[d - 1];
			if (v === undefined) return;
			rate(v);
		} else rate(d);
		state.active = Math.min(scales().length - 1, state.active + 1);
		renderScales();
		remember();
	}
	function rate(v: number) {
		const s = scales()[state.active];
		if (!s) return;
		if (state.ratings[s.key] === v) delete state.ratings[s.key];
		else state.ratings[s.key] = v;
		renderScales();
		remember();
	}
	function renderFlags() {
		$('scales').hidden = state.chosen.size > 0;
		$('anchors').hidden = state.chosen.size > 0 || !(state.anchors || []).length;
		const box = $('quality-flags');
		box.querySelectorAll(':scope > button').forEach((b) => b.remove());
		for (const flag of state.offered || []) {
			const label = state.flags[flag];
			const b = document.createElement('button');
			b.type = 'button';
			b.textContent = label;
			const k = document.createElement('kbd');
			k.textContent = KEYS[flag] || '';
			b.append(k);
			b.setAttribute('aria-pressed', String(state.chosen.has(flag)));
			b.onclick = () => toggle(flag);
			box.append(b);
		}
	}
	function toggle(flag: string) {
		if (state.chosen.has(flag)) state.chosen.delete(flag);
		else state.chosen.add(flag);
		renderFlags();
		remember();
	}
	let inflight = false;
	async function save() {
		const item = current();
		if (!item || inflight) return;
		const c = item.clips[state.clip];
		const body = {
			speaker: item.speaker,
			clip: c.id,
			display: c.display,
			language: state.lang,
			mode: item.repeat || state.mode,
			session: state.session,
			pass: state.pass,
			flags: [...state.chosen],
			ratings: state.chosen.size ? {} : state.ratings,
			note: $<HTMLTextAreaElement>('note').value
		};
		if (!body.flags.length && !Object.keys(body.ratings).length && !body.note.trim()) {
			$('status').textContent = '評価か判定を1つ以上つけてください';
			return;
		}
		inflight = true;
		$<HTMLButtonElement>('save').disabled = true;
		try {
			const r = await fetch('/api/review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!r.ok) throw Error(await r.text());
			state.log.push(await r.json());
			state.reviewed!++;
			delete state.drafts[item.speaker];
			state.at++;
			show();
		} catch (e) {
			$('status').textContent = '保存できませんでした: ' + (e as Error).message;
		} finally {
			inflight = false;
			$<HTMLButtonElement>('save').disabled = false;
		}
	}
	function skip() {
		const item = current();
		if (!item) return;
		stash();
		state.skipped.push(item.speaker);
		state.queue.splice(state.at, 1);
		state.queue.push(item);
		show();
	}
	function renderLog() {
		$('log').replaceChildren();
		for (const r of state.log.slice(-8).reverse()) {
			const p = document.createElement('div');
			const s = document.createElement('strong');
			s.textContent = r.display || r.speaker || '';
			const parts = [
				...(r.flags || []).map((f) => state.flags?.[f] || f),
				...Object.entries(r.ratings || {}).map(
					([k, v]) =>
						(state.scales?.find((s) => s.key === k)?.name || k) +
						' ' +
						(k === 'age' ? (state.decades?.[v] ?? v) : v)
				)
			];
			p.append(s, ' ' + parts.join(' · ') + (r.note ? ' · ' + r.note : ''));
			$('log').append(p);
		}
	}
	document.addEventListener('keydown', (e) => {
		if ($<HTMLDialogElement>('list-dialog').open) {
			if (e.key === 'Escape') $<HTMLDialogElement>('list-dialog').close();
			return;
		}
		if ((e.target as Element).matches('input,textarea')) {
			if (e.key === 'Enter' && !e.isComposing) {
				e.preventDefault();
				void save();
			} else if (e.key === 'Escape') (e.target as HTMLElement).blur();
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
		const k = e.key;
		if (k === 'Enter' || k === ' ') e.preventDefault();
		if (k === ' ') toggle_play();
		else if (k.toLowerCase() === 'r') play();
		else if (k === 'ArrowLeft') step(-1);
		else if (k === 'ArrowRight') step(1);
		else if (k === 'ArrowUp') {
			state.active = Math.max(0, state.active - 1);
			renderScales();
			remember();
		} else if (k === 'ArrowDown') {
			state.active = Math.min(scales().length - 1, state.active + 1);
			renderScales();
			remember();
		} else if (e.shiftKey && /^Digit[1-6]$/.test(e.code)) playAnchor(Number(e.code.slice(5)) - 1);
		else if (/^[0-6]$/.test(k)) key(Number(k));
		else if (k === 'Enter') void save();
		else if (k.toLowerCase() === 's') skip();
		else if (k === 'Backspace') {
			e.preventDefault();
			go(state.at - 1);
		} else if (k.toLowerCase() === 'l') {
			e.preventDefault();
			openList();
		} else {
			const upper = k.toUpperCase();
			for (const [flag, key] of Object.entries(KEYS)) if (key === upper) toggle(flag);
		}
	});
	$('jump').onclick = openList;
	$('list-filter').oninput = renderJump;
	$('list-dialog').querySelector<HTMLElement>('[data-close]')!.onclick = () =>
		$<HTMLDialogElement>('list-dialog').close();
	$('prev-speaker').onclick = () => go(state.at - 1);
	$('play').onclick = toggle_play;
	$('prev-clip').onclick = () => step(-1);
	$('next-clip').onclick = () => step(1);
	$('save').onclick = save;
	$('skip').onclick = skip;
	$('note').oninput = remember;
	$('lang').onchange = () => {
		stash();
		const previous = state.lang;
		state.lang = $<HTMLSelectElement>('lang').value;
		load(recall()).catch((e) => {
			state.lang = previous;
			$<HTMLSelectElement>('lang').value = previous;
			$('status').textContent = e.message;
		});
	};
	for (const b of document.querySelectorAll<HTMLElement>('#pass button'))
		b.onclick = () => {
			state.pass = b.dataset.pass!;
			for (const o of document.querySelectorAll('#pass button'))
				o.setAttribute('aria-pressed', String(o === b));
			state.active = 0;
			renderScales();
			remember();
		};
	for (const b of document.querySelectorAll<HTMLElement>('#mode button'))
		b.onclick = () => {
			if (state.mode === b.dataset.mode) return;
			stash();
			const previous = state.mode;
			state.mode = b.dataset.mode!;
			load(recall()).catch((e) => {
				state.mode = previous;
				$('status').textContent = e.message;
			});
		};
	(window as unknown as { reviewApp: State }).reviewApp = state;
	const saved = recall();
	if (saved.mode === 'update') state.mode = 'update';
	if (saved.pass) state.pass = saved.pass;
	if (saved.lang && [...$<HTMLSelectElement>('lang').options].some((o) => o.value === saved.lang)) {
		state.lang = saved.lang;
		$<HTMLSelectElement>('lang').value = saved.lang;
	}
	load(saved).catch((e) => {
		$('card').hidden = true;
		$('done').hidden = false;
		$('done').textContent = '読み込めませんでした: ' + e.message;
	});
}
