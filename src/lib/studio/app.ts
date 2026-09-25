import captureUrl from '$lib/capture?worker&url';
import { loadImported, importedAudio, importJVS, type ImportClip } from '$lib/corpus-import';
/* The studio: one controller over the page's elements, ported from web/app.js with types.
   Its DOM writes, request order and timing are what the browser goldens pin. */
import { type KoeSelectElement } from '$lib/koe-select';
import { VoiceMap, type MapSample } from '$lib/map';
import { finite, quantile, clamp } from '$lib/math';
import * as engine from '$lib/measure/engine';
import { m } from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import {
	Scorer,
	verdictLabel,
	leaningLabel,
	formatScore,
	gateFailure,
	representatives,
	ageText,
	SCALE_LIMIT,
	type ScoreResult
} from '$lib/score';
import { shareBundle, cardImage, systemShare, labelled } from '$lib/share';
import { SignalView, type Side, type SignalMode } from '$lib/signals';
import { blendedScores, fiveMeasureDistances } from '$lib/similar';
import { AcousticSpace, type Features } from '$lib/space';
import { TakeStore } from '$lib/storage';

import { openHelp, VERDICT_HELP } from './help';
import { fmt, METRICS } from './metrics';
import { snapshot as snap, type LanguageOption, type State, type Theme } from './studio.svelte';
import type {
	Clip,
	Detail,
	PCM,
	SimilarSpeaker,
	Snapshot,
	Take,
	TakeSort,
	View,
	Words
} from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T,
	esc = (s: string | number | null | undefined) =>
		String(s ?? '').replace(
			/[&<>"']/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
		);
const clock = (t: number | undefined | null) =>
	`${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;
const icon = (el: Element, name: string) =>
	el.querySelector('use')?.setAttribute('href', '#i-' + name);
// The reactive studio state (src/lib/studio/studio.svelte.ts) is created per mount by the
// <Studio> shell and passed in, so a remount (HMR, or client-side navigation back to the page)
// gets a fresh, isolated instance and this mount's in-flight callbacks never write a later one.
// The controller reads and writes it as it did the old local object; components read it reactively.
export function mountStudio(state: State): () => void {
	// Cleared when the shell unmounts. A request that settles afterwards belongs to a page that is
	// gone, and the element ids it would write now name the next mount's elements.
	let alive = true;
	// The service worker of the production build (src/service-worker.ts); the registration
	// is the studio's, as Kit's own would report a missing file as a page error.
	if (import.meta.env.PROD && 'serviceWorker' in navigator)
		navigator.serviceWorker.register('/service-worker.js').catch(() => {});
	let favorites = new Set<string>();
	try {
		favorites = new Set(JSON.parse(localStorage.getItem('voice-favorites') || '[]'));
	} catch {}
	const player = $<HTMLAudioElement>('player'),
		reference = $<HTMLAudioElement>('reference-player');
	const map = new VoiceMap(
		$<HTMLCanvasElement>('voice-map'),
		(p) =>
			p.recordingId
				? restoreTake({ storedId: p.recordingId }).catch((e) => notify(e.message, true))
				: selectSample(p as Clip, true),
		{
			tooltip: $('map-tooltip'),
			onManual: () => $('auto-rotate')?.setAttribute('aria-pressed', 'false')
		}
	);
	const signal = new SignalView(
		$<HTMLCanvasElement>('signal-canvas'),
		(s, r) => selectRange(s, r),
		(s, t) => seek(s, t)
	);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined,
		abTimer: ReturnType<typeof setInterval> | null = null,
		audioContext: AudioContext | null = null,
		playbackNodes: Record<Side, GainNode> | null = null,
		recordContext: AudioContext | null = null,
		stream: MediaStream | null = null,
		worklet: AudioWorkletNode | null = null,
		analyser: AnalyserNode | null = null,
		chunks: PCM[] = [],
		samples = 0,
		liveBusy = false,
		liveTimer: ReturnType<typeof setInterval> | null = null,
		liveGeneration = 0,
		blobURL: string | null = null,
		flushResolve: (() => void) | null = null,
		recordSnapshot: Snapshot | null = null,
		liveController: AbortController | null = null,
		recordCamera: {
			autoFit: boolean;
			autoRotate: boolean;
			navigationVersion: number | undefined;
		} | null = null,
		monitorGain: GainNode | null = null,
		importedRefURL: string | null = null;
	function notify(text: string, error = false) {
		$(error ? 'live-alert' : 'live-status').textContent = text;
		clearTimeout(noticeTimer);
		$('notice').textContent = text;
		$('notice').classList.toggle('error', error);
		$('notice').hidden = false;
		noticeTimer = setTimeout(() => ($('notice').hidden = true), error ? 9000 : 4500);
	}
	async function api<T = Detail>(
		url: string,
		options: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}
	): Promise<T> {
		const r = await fetch(url, {
			...options,
			headers: { ...options.headers, 'Accept-Language': getLocale() }
		});
		if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `Request failed (${r.status})`);
		return r.json();
	}
	// The settings dialog's theme select still lives in the template body; it writes the same
	// store action the toolbar's theme button uses. (Its own migration moves both lines.)
	$('theme-select').onchange = (e) =>
		state.setTheme((e.target as HTMLSelectElement).value as Theme);
	$<HTMLSelectElement>('theme-select').value = state.theme;
	for (const b of document.querySelectorAll<HTMLElement>('[data-close]'))
		b.onclick = () => b.closest('dialog')!.close();
	for (const d of document.querySelectorAll('dialog'))
		d.addEventListener('click', (e) => {
			if (e.target === d) {
				const r = d.getBoundingClientRect();
				if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
					d.close();
			}
		});
	function nameOf(c: Clip) {
		if (c.display_label) return c.display_label;
		if (c.native) return c.name!.replace('JVS', 'JVS ');
		if (c.synthetic) return `${c.name || c.speaker} · AI`;
		if (c.group === 'custom') return c.name!;
		if (c.group === 'research') return `${c.dataset} · ${c.speaker}`;
		return `${c.group === 'female' ? 'F' : 'M'} ${String(c.index || 0).padStart(3, '0')}`;
	}
	let fitModel: {
		model: AcousticSpace;
		loo: number[];
		density: (v: number[], exclude?: number) => number;
		count: number;
	} | null = null;
	function buildFit() {
		const refs = state.referenceSpeakers.filter((c) => AcousticSpace.raw(c.features).every(finite));
		if (refs.length < 20) {
			fitModel = null;
			return;
		}
		const model = new AcousticSpace(refs),
			z = refs.map((c) => model.standardized(c.features)!),
			h = Math.pow(z.length, -1 / 9);
		const density = (v: number[], exclude = -1) =>
			z.reduce(
				(sum, p, i) =>
					sum +
					(i === exclude
						? 0
						: Math.exp(-v.reduce((sum, x, k) => sum + (x - p[k]) ** 2, 0) / (2 * h * h))),
				0
			) /
			(z.length - (exclude >= 0 ? 1 : 0));
		fitModel = { model, loo: z.map((v, i) => density(v, i)), density, count: z.length };
	}
	function fitValue(features: Features) {
		if (!fitModel) return null;
		const v = fitModel.model.standardized(features);
		if (!v) return null;
		const d = fitModel.density(v);
		return (100 * fitModel.loo.filter((x) => x <= d).length) / fitModel.loo.length;
	}
	function activeFeatures(side: Side): Features {
		return (side === 'own' ? state.own : state.ref)?.features || {};
	}
	/* The two voices' distance in the map's space, shown as the fit readout; the profile panel
	   renders everything else about the measurements from the store. */
	function updateDistance() {
		const comparison = map.space?.comparison(
			activeFeatures('own'),
			activeFeatures('ref'),
			map.dimension,
			map.projection
		);
		state.distance = comparison ? comparison.distance : null;
	}
	function updateMap() {
		let points: MapSample[] = state.clips.filter(
			(c) =>
				c.plotted &&
				['female', 'male'].includes(c.group) &&
				$<HTMLInputElement>(c.group === 'female' ? 'show-female' : 'show-male').checked
		);
		if (state.lang === 'lab') points = state.clips.filter((c) => c.plotted && teacherMatch(c));
		if (
			state.selected?.plotted &&
			!points.some((c) => c.id === state.selected!.id) &&
			!['female', 'male'].includes(state.selected.group)
		)
			points.push(state.selected);
		points = points.concat(
			state.takes
				.filter((t) => t.stored && t.id !== state.ownTakeId)
				.map((t) => ({
					id: 'recording-' + t.id,
					recordingId: t.id,
					speaker: 'self',
					name: t.name,
					group: 'own-history',
					features: t.features!,
					duration: t.duration,
					language: t.language
				}))
		);
		map.setSamples(points);
		map.selected = state.selected ? { ...state.selected, features: activeFeatures('ref') } : null;
		map.own = state.ownFull;
		map.ownFeatures = activeFeatures('own');
		map.ownRange = state.ranges.own;
		map.target = state.refFull;
		map.targetRange = state.ranges.ref;
		map.showRange = true;
		map.live = state.captureMode === 'live' && state.recording;
		const pitchRefs = state.referenceSpeakers.map((c) => c.features.f0 as number);
		signal.pitchBand = [quantile(pitchRefs, 0.1), quantile(pitchRefs, 0.9)];
	}
	function teacherMatch(c: Clip) {
		return (
			(['pitch', 'resonance', 'weight'] as const).every(
				(k) =>
					$<HTMLSelectElement>('teacher-' + k).value === 'all' ||
					c.configuration?.[k] === $<HTMLSelectElement>('teacher-' + k).value
			) &&
			($<HTMLSelectElement>('teacher').value === 'all' ||
				c.speaker === $<HTMLSelectElement>('teacher').value)
		);
	}
	function filtered() {
		const group = $<HTMLSelectElement>('library-group').value,
			q = $<HTMLInputElement>('search').value.trim().toLowerCase();
		let clips = state.clips.concat(state.custom.filter((c) => c.language === state.lang));
		if (state.lang === 'lab') clips = clips.filter(teacherMatch);
		else
			clips = clips.filter((c) =>
				group === 'favorites'
					? favorites.has(c.id)
					: group === 'all' || c.group === group || (group === 'custom' && c.localLibrary)
			);
		if (q) {
			const compact = (v: string | undefined) =>
					(v || '')
						.normalize('NFKC')
						.toLowerCase()
						.replace(/[\s_-]+/g, '')
						.replace(/^(jvs|cvf|cvm|f|m)0+(?=\d)/, '$1'),
				query = compact(q),
				isId = /^(?:jvs|(?:cv)?[fm])\d+$/.test(query),
				matched = new Set<string>();
			for (const c of clips) {
				if (
					[nameOf(c), c.name, c.speaker, c.id, c.engine, c.synthetic ? 'AI' : ''].some((v) =>
						isId
							? compact(v).replace(/^cv/, '') === query.replace(/^cv/, '')
							: compact(v).includes(query)
					)
				)
					matched.add(speakerKey(c));
			}
			clips = clips.filter((c) => matched.has(speakerKey(c)) || compact(c.text).includes(query));
		}
		const sort = $<HTMLSelectElement>('sort').value,
			f = activeFeatures('own'),
			ranking = sort === 'near' ? similarRanking() : null,
			blended = ranking ? blendedOrder(ranking) : null;
		// Closest first: by the timbre ranking blended with the five measures when the analyzer
		// returned one for this take (speakers it does not index, such as imported ones, go last,
		// and each speaker's nearest clip leads its folder), by the five measures alone otherwise.
		const key = (c: Clip) =>
			blended
				? (blended.get(c.speaker) ?? Infinity)
				: sort === 'near'
					? map.space!.distance(c.features, f)
					: sort === 'low'
						? (c.features.f0 ?? Infinity)
						: sort === 'high'
							? -(c.features.f0 ?? -Infinity)
							: 0;
		const lead = (c: Clip) => (ranking?.get(c.speaker)?.clip === c.id ? 0 : 1);
		return clips.sort((a, b) =>
			sort === 'name'
				? speakerName(a).localeCompare(speakerName(b), state.lang === 'lab' ? 'en' : state.lang, {
						numeric: true
					}) || a.id.localeCompare(b.id)
				: (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) ||
					lead(a) - lead(b) ||
					a.id.localeCompare(b.id)
		);
	}
	/* The near order's score per speaker, recomputed only when the ranking or the measurement
	   it is blended with changes. */
	let blendMemo: {
		ranking: Map<string, SimilarSpeaker>;
		own: Detail | Clip | null;
		scores: Map<string, number>;
	} | null = null;
	function blendedOrder(ranking: Map<string, SimilarSpeaker>) {
		if (blendMemo?.ranking === ranking && blendMemo.own === state.own) return blendMemo.scores;
		const timbre = new Map([...ranking].map(([k, v]) => [k, v.distance]));
		const five = fiveMeasureDistances(map.space!, state.clips, activeFeatures('own'));
		blendMemo = { ranking, own: state.own, scores: blendedScores(timbre, five) };
		return blendMemo.scores;
	}
	function similarCapable() {
		return !!state.capabilities?.similar?.includes(state.lang);
	}
	/* The own audio the ranking describes: the selected section when there is one. */
	function ownSlice(): PCM | null {
		const r = state.ranges.own;
		return !state.ownPCM
			? null
			: r
				? state.ownPCM.slice(Math.round(r[0] * 16000), Math.round(r[1] * 16000))
				: state.ownPCM;
	}
	function similarKeyOf() {
		if (!state.ownPCM) return null;
		const r = state.ranges.own;
		return `${state.lang}:${state.ownToken}:${state.ownPCM.length}:${r ? r.join('-') : ''}`;
	}
	function similarRanking() {
		const key = similarKeyOf();
		return key && state.similar?.key === key ? state.similar.speakers : null;
	}
	/* One ranking request per take and selection; the library re-renders when it lands. */
	async function ensureSimilar() {
		const key = similarKeyOf();
		if (!key || !similarCapable() || state.recording) return;
		if (state.similar?.key === key || state.similarKey === key || state.similarFailed === key)
			return;
		// The descriptor needs two seconds of audio; a shorter selection keeps the five-measure order.
		const pcm = ownSlice()!;
		if (pcm.length < 2 * 16000) return;
		state.similarKey = key;
		try {
			const r = await api<{ speakers: Omit<SimilarSpeaker, 'rank'>[] }>(
				`/api/similar?lang=${encodeURIComponent(state.lang)}&limit=5000`,
				{ method: 'POST', body: pcm }
			);
			if (!alive || state.similarKey !== key) return;
			state.similar = {
				key,
				speakers: new Map(r.speakers.map((s, rank) => [s.speaker, { ...s, rank }]))
			};
		} catch (e) {
			if (alive && state.similarKey === key) {
				state.similarFailed = key;
				notify(m.sort_near_failed({ message: (e as Error).message }), true);
			}
		} finally {
			if (alive && state.similarKey === key) {
				state.similarKey = null;
				if ($<HTMLSelectElement>('sort').value === 'near') renderLibrary();
			}
		}
	}
	/* Re-sorts the library when the own audio or its selection changed under the near order. */
	let renderedNear = false;
	function refreshNearOrder() {
		if (renderedNear || $<HTMLSelectElement>('sort').value === 'near') renderLibrary();
	}
	function renderSortBasis() {
		const near = $<HTMLSelectElement>('sort').value === 'near' && state.lang !== 'lab';
		$('sort-basis').hidden = !near;
		if (!near) return;
		const key = similarKeyOf();
		$('sort-basis').textContent = similarRanking()
			? map.space?.standardized(activeFeatures('own'))
				? m.sort_near_timbre()
				: m.sort_near_timbre_only()
			: key && state.similarKey === key
				? m.sort_near_pending()
				: m.sort_near_acoustic();
	}

	const openSpeakers = new Set<string>(),
		speakerLimits = new Map<string, number>();
	function speakerKey(c: Clip) {
		return `${state.lang}:${c.dataset || c.group}:${c.speaker}`;
	}
	function speakerName(c: Clip) {
		return c.synthetic ? c.name || c.speaker : nameOf(c);
	}
	function clipRow(clip: Clip) {
		const b = document.createElement('button');
		b.className = 'sample-row';
		b.dataset.id = clip.id;
		b.dataset.group = clip.group;
		b.setAttribute('aria-pressed', String(clip.id === state.selected?.id));
		const nearest =
			$<HTMLSelectElement>('sort').value === 'near' &&
			similarRanking()?.get(clip.speaker)?.clip === clip.id;
		b.innerHTML = `<span class="sample-symbol"><svg aria-hidden="true"><use href="#i-play"></use></svg></span><div><span class="sample-title"><b>${esc(clip.text || nameOf(clip))}</b></span><span class="sample-phrase">${fmt(clip.features.f0)} Hz · ${clock(clip.duration)}${clip.synthetic ? ' · AI' : ''}${nearest ? ` · <small class="nearest-badge">${m.sort_nearest_clip()}</small>` : ''}</span></div>`;
		b.title = clip.text!;
		b.onclick = () => selectSample(clip, true);
		b.disabled = state.recording || state.loadingLanguage;
		const row = document.createElement('div');
		row.className = 'sample-item';
		const star = document.createElement('button');
		star.className = 'favorite';
		star.textContent = favorites.has(clip.id) ? '★' : '☆';
		star.setAttribute('aria-pressed', String(favorites.has(clip.id)));
		star.setAttribute(
			'aria-label',
			(favorites.has(clip.id) ? m.favorite_remove_clip : m.favorite_add_clip)({
				name: clip.text || nameOf(clip)
			})
		);
		star.onclick = () => toggleFavorite(clip.id);
		row.append(b, star);
		return row;
	}
	function renderLibrary(reset = false) {
		const focused = (document.activeElement as HTMLElement | null)?.dataset?.id,
			scroll = $('sample-scroll').scrollTop;
		if (reset) {
			state.limit = 30;
			$('sample-scroll').scrollTop = 0;
		}
		renderedNear = $<HTMLSelectElement>('sort').value === 'near';
		if (renderedNear) void ensureSimilar();
		renderSortBasis();
		const clips = filtered(),
			groups = new Map<string, Clip[]>();
		for (const clip of clips) {
			const key = speakerKey(clip);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(clip);
		}
		$('library-count').textContent = String(groups.size);
		$('sample-list').replaceChildren();
		let index = 0;
		for (const [key, items] of groups) {
			if (index++ >= state.limit) break;
			const folder = document.createElement('details');
			folder.className = 'speaker-folder';
			folder.dataset.speaker = key;
			folder.open = openSpeakers.has(key);
			const heading = document.createElement('summary'),
				favs = items.filter((c) => favorites.has(c.id)).length;
			heading.innerHTML = `<svg class="folder-chevron" aria-hidden="true"><use href="#i-chevron"></use></svg><strong>${esc(speakerName(items[0]))}</strong>${items[0].synthetic ? '<small class="ai-badge">AI</small>' : ''}<span class="speaker-count">${items.length}</span>${favs ? `<span class="speaker-star" aria-label="${m.favorite_marked()}">★</span>` : ''}`;
			const list = document.createElement('div');
			list.className = 'speaker-clips';
			const populate = () => {
				list.replaceChildren();
				const limit = speakerLimits.get(key) || 30;
				for (const c of items.slice(0, limit)) list.append(clipRow(c));
				if (items.length > limit) {
					const more = document.createElement('button');
					more.className = 'speaker-more';
					more.textContent = m.samples_more();
					more.onclick = () => {
						speakerLimits.set(key, limit + 30);
						populate();
					};
					list.append(more);
				}
			};
			folder.addEventListener('toggle', () => {
				if (!folder.isConnected) return;
				if (folder.open) {
					openSpeakers.add(key);
					populate();
				} else openSpeakers.delete(key);
			});
			if (folder.open) populate();
			folder.append(heading, list);
			$('sample-list').append(folder);
		}
		$('load-more').hidden = groups.size <= state.limit;
		if (!reset) $('sample-scroll').scrollTop = scroll;
		if (focused)
			$('sample-list')
				.querySelector<HTMLElement>(`[data-id="${focused}"]`)
				?.focus({ preventScroll: true });
		updateMap();
	}
	$('load-more').onclick = () => {
		state.limit += 60;
		renderLibrary();
	};
	for (const id of ['teacher', 'teacher-pitch', 'teacher-resonance', 'teacher-weight'])
		$(id).onchange = () => renderLibrary(true);
	$('sort').onchange = () => {
		state.similarFailed = null;
		renderLibrary(true);
	};
	$('library-group').onchange = () => {
		$<HTMLSelectElement>('sort').value =
			$<HTMLSelectElement>('library-group').value === 'female'
				? 'high'
				: $<HTMLSelectElement>('library-group').value === 'male'
					? 'low'
					: 'name';
		renderLibrary(true);
	};
	$('search').oninput = () => renderLibrary(true);
	for (const id of ['show-female', 'show-male']) $(id).onchange = updateMap;
	async function loadLanguage(lang: string) {
		if (state.recording || state.busy) return;
		const token = ++state.languageToken;
		state.loadingLanguage = true;
		state.detailToken++;
		state.rangeToken.ref++;
		state.wordToken.ref++;
		cancelAB();
		reference.pause();
		controls();
		try {
			const lib = await api<{ clips: Clip[] }>('/api/library?lang=' + encodeURIComponent(lang));
			if (token !== state.languageToken) return;
			state.lang = lang;
			openSpeakers.clear();
			speakerLimits.clear();
			state.ref = state.refFull = state.selected = null;
			state.ranges.ref = null;
			state.words.ref = null;
			signal.set('ref', null);
			$<HTMLButtonElement>('play-reference').disabled = true;
			$<HTMLSelectElement>('language').value = lang;
			$('research-controls').hidden = lang !== 'lab';
			$('group-legend').hidden = lang === 'lab';
			$<HTMLSelectElement>('library-group').disabled = lang === 'lab';
			state.clips = [
				...new Map(
					[...lib.clips, ...state.imported.filter((c) => c.language === lang)].map((c) => [c.id, c])
				).values()
			].map((c) =>
				c.synthetic
					? {
							...c,
							group: ['female', 'male', 'androgynous'].includes(c.voice_label!)
								? c.voice_label!
								: c.group
						}
					: c
			);
			const index: Record<string, number> = {};
			state.clips.forEach((c) => {
				index[c.group] = (index[c.group] || 0) + 1;
				c.index = index[c.group];
			});
			state.scorer = new Scorer(lib.clips);
			state.representatives = representatives(state.clips);
			map.space = new AcousticSpace(
				state.representatives.length ? state.representatives : state.clips.filter((c) => c.plotted)
			);
			map.trackCache = new WeakMap();
			map.reset();
			buildFit();
			syncProjection();
			$<HTMLSelectElement>('library-group').value = lang === 'lab' ? 'all' : 'female';
			$<HTMLSelectElement>('sort').value = lang === 'lab' ? 'name' : 'high';
			state.loadingLanguage = false;
			renderLibrary(true);
			updateDistance();
			const chosen = null;
			await selectSample(
				chosen ||
					filtered().find((c) => c.plotted && !c.synthetic) ||
					filtered().find((c) => !c.synthetic) ||
					filtered()[0],
				false
			);
		} finally {
			if (token === state.languageToken) {
				state.loadingLanguage = false;
				$<HTMLSelectElement>('language').value = state.lang;
				controls();
			}
		}
	}
	/* Each language is its own page, so choosing one navigates; the session remembers it first so the root page follows. */
	$('language').onchange = (e) => {
		const next = (e.target as HTMLSelectElement).value;
		if (next === state.lang || state.recording || state.busy) {
			$<HTMLSelectElement>('language').value = state.lang;
			return;
		}
		sessionReady = false;
		try {
			localStorage.setItem('koenami-session', JSON.stringify({ ...readView(), lang: next }));
		} catch {}
		location.assign(`/${next}/`);
	};
	async function selectSample(clip: Clip | undefined, play = false) {
		if (!clip || state.recording || state.loadingLanguage) return;
		cancelAB();
		reference.pause();
		const previousGroup = state.referenceGroup;
		state.selected = clip;
		document.documentElement.style.setProperty(
			'--reference',
			clip.group === 'male'
				? 'var(--sky)'
				: clip.group === 'female'
					? 'var(--pink)'
					: 'var(--other-reference)'
		);
		signal.images = new WeakMap();
		signal.dirty = true;
		if (previousGroup !== state.referenceGroup) buildFit();
		openSpeakers.add(speakerKey(clip));
		const token = ++state.detailToken;
		state.rangeToken.ref++;
		state.wordToken.ref++;
		state.ranges.ref = null;
		state.words.ref = null;
		state.ref = clip;
		state.refFull = null;
		state.refPCM = clip.pcm || null;
		signal.set('ref', null);
		let localPCM: PCM | null = null;
		if (clip.localLibrary) {
			try {
				const file = await importedAudio(clip.id);
				if (token !== state.detailToken) return;
				if (importedRefURL) URL.revokeObjectURL(importedRefURL);
				importedRefURL = URL.createObjectURL(file);
				reference.src = importedRefURL;
				localPCM = await decode(file);
				if (token !== state.detailToken) return;
				state.refPCM = localPCM;
			} catch (e) {
				notify((e as Error).message, true);
				return;
			}
		} else reference.src = clip.audio!;
		$('selected-name').textContent = nameOf(clip);
		updateFavorite();
		$('selected-meta').textContent =
			`${fmt(clip.features.f0)} Hz · ${fmt(clip.features.delta_f)} ΔF${clip.synthetic ? ' · ' + m.target_meta_synthetic() : ''}`;
		$('selected-text').textContent = clip.text!;
		$('selected-text').lang = state.lang;
		$('source-link').hidden = !clip.source;
		if (clip.source) $<HTMLAnchorElement>('source-link').href = clip.source;
		$<HTMLButtonElement>('play-reference').disabled = false;
		renderLibrary();
		updateDistance();
		renderWords();
		if (play) playSide('ref').catch((e) => notify(e.message, true));
		try {
			const detail: Detail =
				clip.detail ||
				(localPCM
					? await engine.analyze(localPCM)
					: await api('/api/detail/' + encodeURIComponent(clip.id)));
			if (token !== state.detailToken) return;
			state.ref = state.refFull = detail;
			signal.set('ref', detail);
			if (!state.ownFull) setSignalSource('ref');
			updateMap();
			updateDistance();
			if (signal.source === 'ref') updateRangeLabel();
		} catch (e) {
			if (token === state.detailToken)
				notify(m.target_analysis_error({ message: (e as Error).message }), true);
		}
	}
	function controls() {
		const near = $('sort').querySelector<HTMLOptionElement>('option[value=near]')!;
		near.disabled =
			!AcousticSpace.raw(activeFeatures('own')).every(finite) &&
			!(similarCapable() && state.ownPCM);
		if (near.disabled && $<HTMLSelectElement>('sort').value === 'near')
			$<HTMLSelectElement>('sort').value = 'name';
		const busy = state.busy || state.recording || state.loadingLanguage;
		for (const id of [
			'upload',
			'reference-upload',
			'add-reference',
			'play-mine',
			'compare-ab',
			'reference-seek',
			'words-button',
			'range-reset'
		])
			$<HTMLButtonElement>(id).disabled = busy;
		$<HTMLButtonElement>('play-mine').disabled = busy || !state.ownFull;
		$<HTMLButtonElement>('play-reference').disabled = busy || !state.selected;
		$<HTMLButtonElement>('record').disabled =
			state.busy || state.loadingLanguage || (state.recording && state.captureMode === 'live');
		$('record').setAttribute(
			'aria-pressed',
			String(state.recording && state.captureMode === 'record')
		);
		$('record').setAttribute('aria-label', (state.recording ? m.record_stop : m.record_aria)());
		icon($('record'), state.recording && state.captureMode === 'record' ? 'stop' : 'mic');
		$('record').title = (
			state.recording && state.captureMode === 'record' ? m.record_stop_title : m.record_title
		)();
		$<HTMLButtonElement>('live-mode').disabled =
			state.busy || state.loadingLanguage || (state.recording && state.captureMode !== 'live');
		$('live-mode').setAttribute(
			'aria-checked',
			String(state.recording && state.captureMode === 'live')
		);
		const isLive = state.recording && state.captureMode === 'live';
		$('live-mode').setAttribute('aria-label', (isLive ? m.live_stop : m.live_start)());
		$('live-mode').title = (isLive ? m.live_stop_title : m.live_title)();
		$('live-mode-label').textContent = (isLive ? m.live_measuring : m.live_label)();
		$('live-time').hidden = !isLive;
		$<HTMLButtonElement>('loopback').disabled = !state.recording || state.busy;
		renderTakeMenu();
		$('state').textContent = state.recording
			? (state.captureMode === 'live' ? m.live_measuring : m.state_recording)()
			: state.busy
				? m.state_preparing()
				: state.analyzing.has(state.ownTakeId!)
					? m.state_analyzing()
					: '';
		$('state').hidden = !$('state').textContent;
		// The map only moves once the take is analysed; say so over it while the server works.
		document.querySelector<HTMLElement>('.graph-analyzing')!.hidden = !state.analyzing.has(
			state.ownTakeId!
		);
	}
	async function audioReady() {
		if (!audioContext) {
			audioContext = new AudioContext();
			playbackNodes = {} as Record<Side, GainNode>;
			for (const [side, el] of [
				['own', player],
				['ref', reference]
			] as [Side, HTMLAudioElement][]) {
				const source = audioContext.createMediaElementSource(el),
					gain = audioContext.createGain();
				source.connect(gain);
				gain.connect(audioContext.destination);
				playbackNodes[side] = gain;
			}
		}
		await audioContext.resume();
		for (const side of ['own', 'ref'] as Side[]) {
			const detail = side === 'own' ? state.ownFull : state.refFull || state.selected;
			const level = detail?.level_dbfs,
				peak = detail?.peak;
			playbackNodes![side].gain.value =
				$<HTMLInputElement>('normalize').checked && finite(level) && finite(peak)
					? Math.min(4, Math.pow(10, (-24 - level) / 20), 0.85 / (peak || 1))
					: 1;
		}
	}
	function cancelAB() {
		if (abTimer) {
			clearInterval(abTimer);
			abTimer = null;
		}
		$('compare-ab').setAttribute('aria-pressed', 'false');
	}
	// Resolves to whether the play() started rather than being cut short by a pause(), so a
	// caller (A/B) can tell a real start from an interrupted one.
	async function playSide(side: Side, fromStart = false): Promise<boolean> {
		if (state.recording || state.busy || state.loadingLanguage) return false;
		await audioReady();
		const el = side === 'own' ? player : reference,
			other = side === 'own' ? reference : player,
			r = state.ranges[side];
		other.pause();
		if (fromStart || (r && (el.currentTime < r[0] || el.currentTime >= r[1] - 0.02)) || el.ended)
			el.currentTime = r?.[0] || 0;
		// A play() interrupted by a pause() before it starts (switching sides, a quick stop)
		// rejects with AbortError; that is the pause taking effect, not a failure to report.
		let started = true;
		await el.play().catch((e) => {
			if ((e as DOMException).name !== 'AbortError') throw e;
			started = false;
		});
		return started;
	}
	async function toggle(side: Side) {
		cancelAB();
		const el = side === 'own' ? player : reference;
		if (el.paused) await playSide(side);
		else el.pause();
	}
	$('play-mine').onclick = () => toggle('own').catch((e) => notify(e.message, true));
	$('play-reference').onclick = () => toggle('ref').catch((e) => notify(e.message, true));
	$('normalize').onchange = () => {
		if (audioContext) void audioReady();
	};
	for (const [side, el, id] of [
		['own', player, 'play-mine'],
		['ref', reference, 'play-reference']
	] as [Side, HTMLAudioElement, string][]) {
		el.addEventListener('play', () => {
			icon($(id), 'pause');
			$(id).setAttribute('aria-label', (side === 'own' ? m.play_own_pause : m.target_pause)());
			map.invalidate();
		});
		el.addEventListener('pause', () => {
			icon($(id), 'play');
			$(id).setAttribute('aria-label', (side === 'own' ? m.play_own : m.target_play)());
			map.invalidate();
			signal.dirty = true;
		});
		el.addEventListener('error', () => {
			if (el.src) notify(m.error_playback(), true);
		});
		el.addEventListener('timeupdate', () => {
			const d = el.duration;
			if (side === 'ref') {
				if (finite(d))
					$<HTMLInputElement>('reference-seek').value = String((el.currentTime / d) * 100);
				$('reference-time').textContent = clock(el.currentTime);
			} else if (!state.recording)
				$('timer').textContent = state.ownFull
					? clock(el.currentTime) + ' / ' + clock(state.ownFull.duration)
					: '0:00';
			const r = state.ranges[side];
			if (r && el.currentTime >= r[1]) el.pause();
		});
	}
	function seek(side: Side, time: number) {
		if (state.recording) return;
		cancelAB();
		const el = side === 'own' ? player : reference;
		el.currentTime = clamp(time, 0, finite(el.duration) ? el.duration : time);
		map.invalidate();
		signal.dirty = true;
	}
	$('reference-seek').oninput = (e) =>
		seek('ref', (Number((e.target as HTMLInputElement).value) / 100) * (reference.duration || 0));
	$('compare-ab').onclick = async () => {
		if (abTimer) {
			cancelAB();
			player.pause();
			reference.pause();
			return;
		}
		if (!state.selected || !state.ownFull) return;
		try {
			await audioReady();
			const refStart = state.ranges.ref?.[0] || 0,
				ownStart = state.ranges.own?.[0] || 0;
			const seconds = Math.min(
				12,
				(state.ranges.ref?.[1] || state.refFull?.duration || state.selected.duration!) - refStart,
				(state.ranges.own?.[1] || state.ownFull.duration) - ownStart
			);
			if (!finite(seconds) || seconds <= 0) throw new Error(m.error_ab_wait());
			$('compare-ab').setAttribute('aria-pressed', 'true');
			// If a pause() cut the reference short (the user stopped it during start-up), do not
			// start the timer — otherwise the comparison would carry on into the own phase.
			if (!(await playSide('ref', true))) {
				cancelAB();
				return;
			}
			let phase = 'ref';
			abTimer = setInterval(() => {
				// The reference hands over when it reaches its window; `reference.paused` also
				// hands over if it stopped on its own (a user pause goes through toggle(), which
				// cancels A/B first, so it never reaches here).
				if (phase === 'ref' && (reference.paused || reference.currentTime - refStart >= seconds)) {
					reference.pause();
					phase = 'starting';
					playSide('own', true)
						.then((started) => {
							if (started) phase = 'own';
							else cancelAB();
						})
						.catch((e) => {
							cancelAB();
							notify(e.message, true);
						});
				} else if (phase === 'own' && (player.paused || player.currentTime - ownStart >= seconds)) {
					player.pause();
					cancelAB();
				}
			}, 30);
		} catch (e) {
			cancelAB();
			notify((e as Error).message, true);
		}
	};
	for (const b of document.querySelectorAll<HTMLElement>('[data-dimension]'))
		b.onclick = () => {
			map.dimension = Number(b.dataset.dimension);
			map.zoom = 1;
			map.pan = [0, 0];
			map.autoFit = map.dimension === 3;
			map.fitDirty = true;
			$('auto-rotate').hidden = map.dimension !== 3;
			map.projection = map.dimension === 2 ? 'contrast' : 'variance';
			for (const el of document.querySelectorAll('[data-dimension]'))
				el.setAttribute('aria-pressed', String(el === b));
			syncProjection();
			map.invalidate();
			updateMap();
		};
	for (const b of document.querySelectorAll<HTMLElement>('[data-projection]'))
		b.onclick = () => setProjection(b.dataset.projection!);
	function setProjection(name: string) {
		if (!name || name === map.projection) return;
		map.projection = name;
		map.zoom = 1;
		map.pan = [0, 0];
		map.center = [0.5, 0.5];
		syncProjection();
		map.invalidate();
		updateMap();
	}
	function syncProjection() {
		const available = (map.space?.projections || {}) as Record<string, unknown>;
		if (!available[map.projection]) map.projection = 'variance';
		const controls = $('projection-controls');
		controls.hidden = map.dimension !== 2;
		controls.querySelector<HTMLButtonElement>('[data-projection=contrast]')!.disabled =
			!available.contrast;
		for (const el of document.querySelectorAll<HTMLElement>('[data-projection]'))
			el.setAttribute('aria-pressed', String(el.dataset.projection === map.projection));
		$('space-label').title = (
			map.projection === 'contrast' ? m.graph_space_title_contrast : m.graph_space_title
		)();
	}
	$('zoom-in').onclick = () => map.zoomBy(1.2);
	$('zoom-out').onclick = () => map.zoomBy(1 / 1.2);
	$('reset-view').onclick = () => map.reset();
	$('find-me').onclick = () => {
		const v = map.vector(activeFeatures('own'));
		if (v && map.dimension === 2) {
			map.center = v.slice(0, 2);
			map.invalidate();
		} else if (map.dimension === 3) {
			map.fitScope = 'voices';
			map.autoFit = true;
			map.fitDirty = true;
			map.invalidate();
		}
	};
	function changeSpeed(e: { target: HTMLInputElement }) {
		const rate = Number(e.target.value);
		$('speed-reset').textContent = rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + '×';
		for (const el of [player, reference]) {
			el.defaultPlaybackRate = rate;
			el.playbackRate = rate;
			el.preservesPitch = true;
		}
		try {
			localStorage.setItem('voice-speed', String(rate));
		} catch {}
	}
	try {
		const speed = localStorage.getItem('voice-speed');
		if (speed && Number(speed) >= 0.5 && Number(speed) <= 1.5)
			$<HTMLInputElement>('playback-speed').value = speed;
	} catch {}
	$('playback-speed').oninput = (e) => changeSpeed({ target: e.target as HTMLInputElement });
	$('speed-reset').onclick = () => {
		$<HTMLInputElement>('playback-speed').value = '1';
		changeSpeed({ target: $<HTMLInputElement>('playback-speed') });
	};
	changeSpeed({ target: $<HTMLInputElement>('playback-speed') });
	function syncSignalSegment() {
		$('signal-own').setAttribute(
			'aria-pressed',
			String(!signal.overlay && signal.source === 'own')
		);
		$('signal-both').setAttribute('aria-pressed', String(signal.overlay));
		$('signal-ref').setAttribute(
			'aria-pressed',
			String(!signal.overlay && signal.source === 'ref')
		);
		$('signal-both').title = (signal.overlay ? m.signal_both_title_on : m.signal_both_title)();
	}
	function setSignalSource(side: Side) {
		signal.source = side;
		syncSignalSegment();
		signal.dirty = true;
		renderWords();
		updateRangeLabel();
	}
	function setSignalOverlay(on: boolean) {
		signal.overlay = on;
		syncSignalSegment();
		signal.dirty = true;
		renderWords();
		updateRangeLabel();
	}
	$('signal-own').onclick = () => {
		setSignalOverlay(false);
		setSignalSource('own');
	};
	$('signal-ref').onclick = () => {
		setSignalOverlay(false);
		setSignalSource('ref');
	};
	$('signal-both').onclick = () => setSignalOverlay(true);
	$('signal-view').onchange = (e) => {
		signal.mode = (e.target as HTMLSelectElement).value as SignalMode;
		signal.dirty = true;
	};
	function updateRangeLabel() {
		const side = signal.source,
			r = state.ranges[side],
			d = (side === 'own' ? state.ownFull : state.refFull)?.duration || 0;
		$('range-reset').hidden = !r;
		$('range-label').textContent = r ? `${r[0].toFixed(2)}–${r[1].toFixed(2)}s` : clock(d);
	}
	async function selectRange(side: Side, range: [number, number] | null) {
		if (state.recording) return;
		const full = side === 'own' ? state.ownFull : state.refFull;
		if (!full) return;
		const token = ++state.rangeToken[side];
		state.ranges[side] = range;
		signal.setRange(side, range);
		updateRangeLabel();
		renderWords();
		if (side === 'own') refreshNearOrder();
		if (!range) {
			if (side === 'own') state.own = full;
			else state.ref = full;
			updateMap();
			updateDistance();
			if (side === 'own') refreshNearOrder();
			if (sessionReady) {
				void persistTakes();
				saveView();
			}
			return;
		}
		seek(side, range[0]);
		updateMap();
		const id = side === 'own' ? state.ownId : state.selected?.id;
		try {
			let detail: Detail;
			if (id && !id.startsWith('custom-') && !(side === 'ref' && state.selected?.localLibrary))
				detail = await api(
					`/api/detail/${encodeURIComponent(id)}?start=${range[0]}&end=${range[1]}`
				);
			else {
				const pcm = side === 'own' ? state.ownPCM : state.refPCM;
				if (!pcm) return;
				detail = await engine.analyze(
					pcm.slice(Math.round(range[0] * 16000), Math.round(range[1] * 16000))
				);
				detail.offset = range[0];
			}
			if (token !== state.rangeToken[side]) return;
			if (side === 'own') state.own = detail;
			else state.ref = detail;
			signal.setRange(side, range, detail);
			updateMap();
			updateDistance();
			if (side === 'own') refreshNearOrder();
		} catch (e) {
			if (token === state.rangeToken[side]) notify((e as Error).message, true);
		}
	}
	$('range-reset').onclick = () => selectRange(signal.source, null);
	function setLiveShapeWindow(value: unknown) {
		map.liveShapeSeconds = clamp(Math.round(Number(value) || 5), 1, 30);
		$<HTMLInputElement>('live-shape-window').value = String(map.liveShapeSeconds);
		$('live-shape-duration').textContent = m.settings_seconds({ n: map.liveShapeSeconds });
		$('live-shape-window').setAttribute(
			'aria-valuetext',
			m.settings_seconds({ n: map.liveShapeSeconds })
		);
		map.invalidate();
	}
	$('live-shape-window').oninput = (e) => {
		setLiveShapeWindow((e.target as HTMLInputElement).value);
		saveView();
	};
	function renderWords() {
		const side = signal.source,
			entries = state.words[side]?.words || [];
		$('word-list').replaceChildren();
		const range = state.ranges[side];
		for (const w of entries) {
			const b = document.createElement('button');
			b.textContent = w.text;
			b.title = m.signal_word_title({ start: w.start.toFixed(2), end: w.end.toFixed(2) });
			b.className = range && w.start >= range[0] - 0.01 && w.end <= range[1] + 0.01 ? 'active' : '';
			b.onclick = () => {
				const duration = (side === 'own' ? state.ownFull : state.refFull)?.duration || 0;
				const end = Math.min(duration, Math.max(w.end + 0.03, 0.25)),
					start = Math.max(0, Math.min(w.start - 0.03, end - 0.25));
				void selectRange(side, [start, end]);
			};
			$('word-list').append(b);
		}
	}
	$('words-button').onclick = async () => {
		const side = signal.source,
			id = side === 'own' ? state.ownId : state.selected?.id;
		if (state.words[side]) {
			renderWords();
			return;
		}
		const token = ++state.wordToken[side];
		$<HTMLButtonElement>('words-button').disabled = true;
		$('words-button').textContent = '…';
		try {
			let result: Words;
			const lang = side === 'own' ? state.ownLanguage : state.lang === 'lab' ? 'en' : state.lang;
			if (id && !id.startsWith('custom-') && !(side === 'ref' && state.selected?.localLibrary))
				result = await api<Words>(`/api/words/${encodeURIComponent(id)}?lang=${lang}`);
			else {
				const pcm = side === 'own' ? state.ownPCM : state.refPCM;
				if (!pcm) throw new Error(m.error_words_first());
				result = await api<Words>('/api/words?lang=' + lang, { method: 'POST', body: pcm });
			}
			if (token === state.wordToken[side]) {
				state.words[side] = result;
				renderWords();
			}
		} catch (e) {
			notify((e as Error).message, true);
		} finally {
			$<HTMLButtonElement>('words-button').disabled = false;
			$('words-button').textContent = m.signal_words();
		}
	};
	async function decode(blob: Blob): Promise<PCM> {
		if (blob.size > 150 * 1024 * 1024) throw new Error(m.error_file_size());
		const ctx = new AudioContext();
		try {
			const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
			if (decoded.duration > 900 || decoded.duration < 0.25) throw new Error(m.error_duration());
			const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000),
				source = off.createBufferSource();
			source.buffer = decoded;
			source.connect(off.destination);
			source.start();
			return (await off.startRendering()).getChannelData(0).slice();
		} finally {
			await ctx.close();
		}
	}
	function wav(pcm: PCM, rate = 16000) {
		const b = new ArrayBuffer(44 + pcm.length * 2),
			v = new DataView(b),
			str = (at: number, s: string) => {
				for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
			};
		str(0, 'RIFF');
		v.setUint32(4, 36 + pcm.length * 2, true);
		str(8, 'WAVE');
		str(12, 'fmt ');
		v.setUint32(16, 16, true);
		v.setUint16(20, 1, true);
		v.setUint16(22, 1, true);
		v.setUint32(24, rate, true);
		v.setUint32(28, rate * 2, true);
		v.setUint16(32, 2, true);
		v.setUint16(34, 16, true);
		str(36, 'data');
		v.setUint32(40, pcm.length * 2, true);
		for (let i = 0; i < pcm.length; i++)
			v.setInt16(44 + i * 2, Math.round(clamp(pcm[i], -1, 1) * 32767), true);
		return new Blob([b], { type: 'audio/wav' });
	}
	function download(blob: Blob, name: string) {
		const u = URL.createObjectURL(blob),
			a = document.createElement('a');
		a.href = u;
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(u), 1000);
	}
	function qualityMessage(reason: string | null | undefined) {
		return (
			(
				{
					'No reliable voiced speech. Check the microphone and speak normally.':
						m.quality_no_voice(),
					'Speak for a little longer.': m.quality_longer(),
					'Unstable resonance estimate.': m.quality_resonance()
				} as Record<string, string>
			)[reason!] ||
			reason ||
			''
		);
	}
	function setOwn(
		detail: Detail,
		name: string,
		id: string | null,
		pcm: PCM | null,
		url: string | null = null,
		remember = true
	) {
		if (remember) {
			const previous = state.captureMode ? recordSnapshot : snapshotOwn();
			if (previous?.detail && (previous.pcm || previous.url)) state.previousTake = previous;
			state.ownTakeId = null;
		}
		state.ownToken++;
		state.rangeToken.own++;
		state.wordToken.own++;
		state.own = state.ownFull = detail;
		state.ownName = name;
		state.ownLanguage = id === 'baseline' ? 'ja' : state.lang === 'lab' ? 'en' : state.lang;
		state.ownId = id;
		state.ownPCM = pcm;
		state.words.own = null;
		state.ranges.own = null;
		signal.set('own', detail);
		if (remember) setSignalSource('own');
		state.liveClock = null;
		signal.live = false;
		if (blobURL) {
			URL.revokeObjectURL(blobURL);
			blobURL = null;
		}
		if (pcm) {
			blobURL = URL.createObjectURL(wav(pcm));
			player.src = blobURL;
		} else player.src = url!;
		$('timer').textContent = clock(detail.duration);
		updateDistance();
		updateMap();
		renderWords();
		updateRangeLabel();
		const bad = qualityMessage(detail.reason);
		$('quality-state').textContent = bad;
		$('quality-state').hidden = !bad;
		controls();
		// A restore passes remember = false and refreshes itself once its selection is back in
		// place; refreshing here as well would rank the unselected take first.
		if (remember) refreshNearOrder();
		if (remember && !recordSnapshot) void persistTakes();
	}
	async function importAudio(file: File | undefined, side: Side) {
		if (!file || state.busy || state.recording) return;
		cancelAB();
		player.pause();
		reference.pause();
		stopReplay();
		state.busy = true;
		controls();
		try {
			const pcm = await decode(file);
			if (pcm.length / 16000 > (state.capabilities?.maxSeconds || 900))
				throw new Error(m.error_too_long({ n: (state.capabilities?.maxSeconds || 900) / 60 }));
			const detail = await engine.analyze(pcm);
			if (side === 'own') {
				setOwn(detail, file.name, null, pcm);
				await saveTake();
			} else {
				const c: Clip = {
					id: 'custom-' + Date.now(),
					name: file.name,
					speaker: 'custom-' + Date.now(),
					group: 'custom',
					language: state.lang,
					audio: URL.createObjectURL(wav(pcm)),
					text: file.name,
					features: detail.features,
					duration: detail.duration,
					plotted: finite(detail.features.delta_f),
					detail,
					pcm
				};
				// `custom` is $state.raw, so reassign rather than mutate in place.
				state.custom = [...state.custom, c];
				$<HTMLSelectElement>('library-group').value = 'custom';
				await selectSample(c, false);
			}
			notify(m.notice_imported());
		} catch (e) {
			notify((e as Error).message, true);
		} finally {
			state.busy = false;
			controls();
			$<HTMLInputElement>('upload').value = '';
			$<HTMLInputElement>('reference-upload').value = '';
		}
	}
	$('upload').onchange = (e) => importAudio((e.target as HTMLInputElement).files![0], 'own');
	$('reference-upload').onchange = (e) =>
		importAudio((e.target as HTMLInputElement).files![0], 'ref');
	function mergeChunks(limit = Infinity): PCM {
		const count = Math.min(
				chunks.reduce((n, c) => n + c.length, 0),
				limit
			),
			out = new Float32Array(count);
		let position = count;
		for (let i = chunks.length - 1; i >= 0 && position > 0; i--) {
			const n = Math.min(chunks[i].length, position);
			out.set(chunks[i].subarray(chunks[i].length - n), position - n);
			position -= n;
		}
		return out;
	}
	async function resample(pcm: PCM, rate: number): Promise<PCM> {
		if (rate === 16000) return pcm;
		const ctx = new OfflineAudioContext(1, Math.ceil((pcm.length / rate) * 16000), 16000),
			buffer = ctx.createBuffer(1, pcm.length, rate);
		buffer.copyToChannel(pcm, 0);
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		source.connect(ctx.destination);
		source.start();
		return (await ctx.startRendering()).getChannelData(0).slice();
	}
	async function liveMeasure() {
		if (liveBusy || !state.recording || !recordContext || samples < recordContext.sampleRate * 0.5)
			return;
		liveBusy = true;
		const generation = liveGeneration,
			rate = recordContext.sampleRate,
			end = samples / rate,
			window = Number($<HTMLSelectElement>('live-window').value),
			raw = mergeChunks(Math.floor(rate * window)),
			offset = end - raw.length / rate;
		try {
			const pcm = await resample(raw, rate),
				measured = await engine.live(pcm, (liveController = new AbortController()).signal);
			if (generation !== liveGeneration || !state.recording) return;
			const rows = measured.track!.map((p) => ({ ...p, t: p.t + offset }));
			const replaceAt = Math.max(offset + 0.12, end - window + 0.12);
			state.liveTrack = state.liveTrack
				.filter((p) => p.t < replaceAt && (state.captureMode !== 'live' || p.t > end - 90))
				.concat(rows.filter((p) => p.t >= replaceAt));
			state.ownFull = { ...measured, track: state.liveTrack, duration: end };
			state.own = measured;
			state.ranges.own = null;
			state.liveClock = {
				end: rows.at(-1)?.t || end,
				at: performance.now(),
				start: Math.max(0, end - 0.65)
			};
			signal.data.own = measured;
			signal.ranges.own = [0, measured.duration];
			signal.focus.own = null;
			signal.live = true;
			signal.dirty = true;
			map.own = state.ownFull;
			map.ownFeatures = measured.features;
			map.ownRange = null;
			map.invalidate();
			$('quality-state').textContent = measured.active ? '' : m.quality_waiting();
			$('quality-state').hidden = !!measured.active;
			updateDistance();
		} catch (e) {
			if (generation === liveGeneration && (e as Error).name !== 'AbortError')
				notify((e as Error).message, true);
		} finally {
			if (generation === liveGeneration) liveBusy = false;
		}
	}
	async function startRecording(mode: 'record' | 'live' = 'record') {
		if (state.busy || state.recording || state.loadingLanguage) return;
		recordSnapshot = snapshotOwn();
		state.captureMode = mode;
		void persistTakes();
		state.rangeToken.own++;
		state.wordToken.own++;
		state.busy = true;
		controls();
		cancelAB();
		player.pause();
		reference.pause();
		stopReplay();
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			});
			recordContext = new AudioContext({ latencyHint: 'interactive' });
			await recordContext.audioWorklet.addModule(captureUrl);
			const source = recordContext.createMediaStreamSource(stream);
			worklet = new AudioWorkletNode(recordContext, 'voice-capture');
			analyser = recordContext.createAnalyser();
			analyser.fftSize = 2048;
			const mute = recordContext.createGain();
			mute.gain.value = 0;
			source.connect(worklet);
			source.connect(analyser);
			monitorGain = recordContext.createGain();
			monitorGain.gain.value = 0;
			source.connect(monitorGain);
			monitorGain.connect(recordContext.destination);
			worklet.connect(mute);
			mute.connect(recordContext.destination);
			chunks = [];
			samples = 0;
			state.liveTrack = [];
			signal.source = 'own';
			setSignalSource('own');
			state.liveClock = null;
			state.recording = true;
			recordCamera = {
				autoFit: map.autoFit,
				autoRotate: map.autoRotate,
				navigationVersion: map.navigationVersion
			};
			map.autoFit = false;
			map.autoRotate = false;
			$('auto-rotate').setAttribute('aria-pressed', 'false');
			map.live = mode === 'live';
			state.busy = false;
			liveGeneration++;
			liveBusy = false;
			worklet.port.onmessage = ({ data }) => {
				if (data === 'flushed') {
					flushResolve?.();
					flushResolve = null;
					return;
				}
				if (data instanceof Float32Array) {
					chunks.push(data as PCM);
					samples += data.length;
					if (state.captureMode === 'live') {
						let retained = chunks.reduce((n, c) => n + c.length, 0);
						while (
							chunks.length > 1 &&
							retained - chunks[0].length > recordContext!.sampleRate * 12.2
						)
							retained -= chunks.shift()!.length;
					} else if (samples >= recordContext!.sampleRate * (state.capabilities?.maxSeconds || 900))
						void stopRecording();
				}
			};
			await recordContext.resume();
			liveTimer = setInterval(liveMeasure, 480);
			controls();
		} catch (e) {
			await releaseMic();
			state.busy = false;
			state.recording = false;
			recordSnapshot = null;
			state.captureMode = null;
			controls();
			notify(
				(e as Error).name === 'NotAllowedError' ? m.error_mic_denied() : (e as Error).message,
				true
			);
		}
	}
	async function releaseMic() {
		if (monitorGain) {
			monitorGain.disconnect();
			monitorGain = null;
		}
		$('loopback').setAttribute('aria-pressed', 'false');
		$('loopback').setAttribute('aria-label', m.loopback_aria());
		if (worklet) {
			worklet.port.onmessage = null;
			worklet.port.close();
		}
		liveController?.abort();
		liveController = null;
		clearInterval(liveTimer!);
		liveTimer = null;
		for (const t of stream?.getTracks() || []) t.stop();
		stream = null;
		if (recordContext) {
			try {
				await recordContext.close();
			} catch {}
		}
		recordContext = null;
		worklet = null;
		analyser = null;
	}
	function snapshotOwn(): Snapshot | null {
		if (!state.ownFull) return null;
		return {
			takeId: state.ownTakeId ?? null,
			detail: state.ownFull,
			measurement: state.own,
			range: state.ranges.own,
			words: state.words.own,
			pcm: state.ownPCM,
			name: state.ownName,
			id: state.ownId,
			language: state.ownLanguage,
			url: state.ownId === 'baseline' ? '/data/baseline.wav' : null
		};
	}
	function applySnapshot(t: Snapshot | null | undefined) {
		if (!t?.detail) return;
		setOwn(t.detail, t.name, t.id, t.pcm, t.url, false);
		state.ownTakeId = t.takeId;
		state.ownLanguage = t.language;
		state.own = t.measurement || t.detail;
		state.ranges.own = t.range;
		state.words.own = t.words;
		signal.setRange('own', t.range, t.range ? state.own : null);
		signal.live = false;
		state.liveClock = null;
		map.live = false;
		updateMap();
		updateDistance();
		renderWords();
		updateRangeLabel();
		controls();
		refreshNearOrder();
	}
	function persistTakes() {
		const current = state.recording ? recordSnapshot : snapshotOwn();
		if (!current) return Promise.resolve();
		return TakeStore.write(snap({ current, previous: state.previousTake || null })).catch(() =>
			notify(m.error_take_save(), true)
		);
	}
	function restoreRecording() {
		if (recordSnapshot) applySnapshot(recordSnapshot);
		else clearOwn();
	}
	async function cancelCapture() {
		if (state.busy) return;
		state.busy = true;
		state.recording = false;
		liveGeneration++;
		controls();
		await releaseMic();
		restoreRecording();
		recordSnapshot = null;
		state.busy = false;
		state.captureMode = null;
		chunks = [];
		restoreCamera();
		controls();
	}
	function pendingAnalysis(pcm: PCM): Detail {
		const waveform: [number, number][] = [];
		for (let i = 0; i < pcm.length; i += Math.ceil(pcm.length / 1400)) {
			const chunk = pcm.subarray(i, i + Math.ceil(pcm.length / 1400));
			let low = 0,
				high = 0;
			for (const n of chunk) {
				low = Math.min(low, n);
				high = Math.max(high, n);
			}
			waveform.push([low, high]);
		}
		return {
			duration: pcm.length / 16000,
			features: {},
			track: [],
			visuals: { waveform },
			analysisPending: true,
			reason: null
		};
	}
	async function stopRecording() {
		if (!state.recording || state.busy) return;
		if (state.captureMode === 'live') {
			await cancelCapture();
			return;
		}
		state.recording = false;
		state.busy = true;
		liveGeneration++;
		clearInterval(liveTimer!);
		controls();
		let accepted = false,
			queued: Snapshot | null = null;
		try {
			await new Promise<void>((resolve) => {
				flushResolve = resolve;
				worklet!.port.postMessage('flush');
				setTimeout(resolve, 500);
			});
			const rate = recordContext!.sampleRate,
				maxSeconds = state.capabilities?.maxSeconds || 900,
				raw = mergeChunks().subarray(0, Math.floor(rate * maxSeconds));
			await releaseMic();
			const pcm = (await resample(raw, rate)).slice(0, 16000 * maxSeconds);
			if (pcm.length < 4000) throw new Error(m.error_too_short());
			setOwn(pendingAnalysis(pcm), m.takes_default_name({ n: state.takes.length + 1 }), null, pcm);
			accepted = true;
			await saveTake();
			recordSnapshot = null;
			await persistTakes();
			queued = snapshotOwn();
		} catch (e) {
			if (!accepted) restoreRecording();
			notify((e as Error).message, true);
		} finally {
			recordSnapshot = null;
			await releaseMic();
			chunks = [];
			state.recording = false;
			state.busy = false;
			state.captureMode = null;
			state.liveClock = null;
			map.live = false;
			restoreCamera();
			controls();
		}
		if (queued) void analyzeTake(queued);
	}
	$('record').onclick = () => (state.recording ? stopRecording() : startRecording('record'));
	$('loopback').onclick = () => {
		if (!monitorGain || !recordContext || !state.recording) return;
		const enabled = $('loopback').getAttribute('aria-pressed') !== 'true';
		monitorGain.gain.setTargetAtTime(enabled ? 0.7 : 0, recordContext.currentTime, 0.015);
		$('loopback').setAttribute('aria-pressed', String(enabled));
		$('loopback').setAttribute('aria-label', (enabled ? m.loopback_stop : m.loopback_aria)());
	};
	$('live-mode').onclick = () => (state.recording ? stopRecording() : startRecording('live'));
	window.addEventListener('keydown', (e) => {
		if (
			e.repeat ||
			document.querySelector('dialog[open]') ||
			['INPUT', 'TEXTAREA', 'SELECT', 'KOE-SELECT'].includes((e.target as Element).tagName) ||
			(e.target as HTMLElement).isContentEditable
		)
			return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (!state.recording) $('play-mine').click();
		} else if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
			e.preventDefault();
			if (state.recording) void stopRecording();
			else void startRecording('record');
		} else if (e.code === 'Escape') {
			if (state.recording) void cancelCapture();
			else if (!state.busy) {
				e.preventDefault();
				for (const side of ['own', 'ref'] as Side[])
					if (state.ranges[side]) void selectRange(side, null);
			}
		}
	});
	window.addEventListener('beforeunload', () => {
		for (const t of stream?.getTracks() || []) t.stop();
	});
	async function saveTake(id: string = crypto.randomUUID()) {
		state.ownTakeId = id;
		const snapshot = snapshotOwn()!,
			old = state.takes.find((t) => t.id === id),
			quality = state.ownFull!.analysisPending
				? undefined
				: Object.fromEntries(
						[
							'voiced_seconds',
							'formant_seconds',
							'clipping_fraction',
							'resonance_sensitivity_pct'
						].map((k) => [k, state.ownFull![k] as number])
					),
			take: Take = {
				id,
				name: state.ownName,
				date: old?.date || new Date().toISOString(),
				features: state.ownFull!.features,
				duration: state.ownFull!.duration,
				language: state.ownLanguage,
				stored: true,
				...(quality && { quality }),
				...(snapshot?.pcm && { peaks: wavePeaks(snapshot.pcm)! })
			};
		const saved = await TakeStore.saveRecording(snap(snapshot), snap(take));
		state.takes = saved!.index;
		await persistTakes();
		renderTakeMenu();
		updateMap();
	}
	async function analyzeTake(take: Snapshot) {
		const id = take.takeId;
		if (!id || state.analyzing.has(id)) return;
		state.analyzing.add(id);
		controls();
		try {
			const detail = await engine.analyze(take.pcm!);
			const updated = await TakeStore.finishRecording<Take>(id, detail);
			if (!updated) return;
			state.takes = updated.index;
			const complete = (snapshot: Snapshot | null | undefined) =>
				snapshot?.takeId === id
					? { ...snapshot, detail, measurement: snapshot.range ? snapshot.measurement : detail }
					: snapshot;
			state.previousTake = complete(state.previousTake) ?? null;
			recordSnapshot = complete(recordSnapshot) ?? null;
			if (!state.recording && state.ownTakeId === id) {
				state.ownFull = detail;
				if (!state.ranges.own) state.own = detail;
				signal.set('own', detail);
				signal.setRange('own', state.ranges.own, state.ranges.own ? state.own : null);
				updateDistance();
				updateRangeLabel();
				refreshNearOrder();
				const warning = qualityMessage(detail.reason) || '';
				$('quality-state').textContent = warning;
				$('quality-state').hidden = !warning;
			}
			updateMap();
			await persistTakes();
		} catch {
			if (state.takes.some((t) => t.id === id)) notify(m.error_take_kept(), true);
		} finally {
			state.analyzing.delete(id);
			controls();
		}
	}
	async function retryAnalysis() {
		if (state.busy || state.recording || !state.ownPCM) return;
		if (!state.takes.some((t) => t.id === state.ownTakeId && t.stored)) {
			state.busy = true;
			controls();
			try {
				await saveTake(state.ownTakeId || crypto.randomUUID());
			} catch {
				notify(m.error_take_save_retry(), true);
				return;
			} finally {
				state.busy = false;
				controls();
			}
		}
		await analyzeTake(snapshotOwn()!);
	}

	function reportHTML() {
		const f = activeFeatures('own'),
			r = activeFeatures('ref'),
			comparison = map.space?.comparison(f, r, map.dimension, map.projection),
			fit = fitValue(f),
			refs = state.referenceSpeakers;
		const rows = METRICS.map((metric) => {
			const vals = refs.map((c) => c.features[metric.key]).filter(finite);
			return `<tr><td>${metric.label} · ${metric.unit}</td><td>${fmt(f[metric.key], metric.n)}</td><td>${fmt(r[metric.key], metric.n)}</td><td>${m.help_band_range({ low: fmt(quantile(vals, 0.1), metric.n), high: fmt(quantile(vals, 0.9), metric.n) })}</td></tr>`;
		});
		for (const [key, label] of [
			['pitch_sd_hz', m.report_pitch_sd_hz()],
			['pitch_sd_st', m.report_pitch_sd_st()],
			['quiet_pct', m.report_quiet_pct()],
			['quiet_mean', m.report_quiet_mean()],
			['f1', 'F1 · Hz'],
			['f2', 'F2 · Hz'],
			['f3', 'F3 · Hz'],
			['f4', 'F4 · Hz']
		])
			rows.push(
				`<tr><td>${label}</td><td>${fmt((f as Record<string, unknown>)[key], 1)}</td><td>${fmt((r as Record<string, unknown>)[key], 1)}</td><td>—</td></tr>`
			);
		if (state.words.own?.pace)
			rows.push(
				`<tr><td>${esc(m.report_pace({ unit: state.words.own.pace_unit ?? '' }))}</td><td>${fmt(state.words.own.pace, 1)}</td><td>${state.words.ref?.pace_unit === state.words.own.pace_unit ? fmt(state.words.ref!.pace, 1) : '—'}</td><td>—</td></tr>`
			);
		const notes: string[] = [];
		if (finite(f.f0) && finite(r.f0)) {
			const diff = 12 * Math.log2(r.f0 / f.f0);
			notes.push(
				m.report_note_pitch({
					diff: fmt(Math.abs(diff), 1),
					direction: (diff >= 0 ? m.report_higher : m.report_lower)()
				})
			);
		}
		if (finite(f.delta_f) && finite(r.delta_f))
			notes.push(m.report_note_resonance({ own: fmt(f.delta_f), ref: fmt(r.delta_f) }));
		notes.push(m.report_note_intonation());
		return `<div class="report-score">${comparison ? fmt(comparison.distance, 2) : '—'}</div><p>${m.report_distance_caption()}</p><p class="small">${m.report_distance_note()}</p>${comparison ? `<p>${m.report_share({ shown: Math.round(comparison.displayedShare * 100), omitted: Math.round((1 - comparison.displayedShare) * 100) })}</p><p class="small">${m.report_share_note()}</p>` : ''}<table class="report-table"><thead><tr><th>${m.report_col_metric()}</th><th>${m.report_col_own()}</th><th>${m.report_col_ref()}</th><th>${m.report_col_band()}</th></tr></thead><tbody>${rows.join('')}</tbody></table><ul class="report-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p class="small">${esc(m.report_footer({ name: state.ownName, duration: clock(state.ownFull?.duration), reference: nameOf((state.selected || {}) as Clip) }))}<br>${esc(m.report_languages({ own: state.ownLanguage, ref: state.lang }))}${fit === null ? '' : '<br>' + esc(m.report_density({ group: state.referenceGroupLabel, percentile: Math.round(fit) }))}<br>${esc(m.report_projection({ dimension: map.dimension, variance: Math.round((map.space?.explained(map.dimension, map.projection) || 0) * 100) }))}</p>`;
	}
	$('report-button').onclick = () => {
		$('report-content').innerHTML = reportHTML();
		$<HTMLDialogElement>('report-dialog').showModal();
	};
	$('report-save').onclick = () => {
		const html = `<!doctype html><html lang="${getLocale()}"><meta charset="utf-8"><title>${esc(m.report_file_title())}</title><style>body{font:15px system-ui;max-width:850px;margin:40px auto;padding:0 20px;color:#30364c}.report-score{font-size:40px;color:#b44e80}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:right;border-bottom:1px solid #ddd}td:first-child,th:first-child{text-align:left}.small{font-size:12px;color:#555;line-height:1.7}li{margin:14px 0;line-height:1.7}</style>${reportHTML()}<p><a href="https://www.isca-archive.org/interspeech_2025/netzorg25_interspeech.html">${esc(m.report_method_link())}</a> · ${new Date().toLocaleDateString(getLocale())}</p>`;
		download(new Blob([html], { type: 'text/html' }), 'voice-comparison.html');
	};
	$('export').onclick = () =>
		download(
			new Blob(
				[
					JSON.stringify(
						{
							version: 3,
							language: state.lang,
							name: state.ownName,
							selection: state.ranges.own,
							measurement: state.own,
							reference: state.selected
								? { id: state.selected.id, features: activeFeatures('ref') }
								: null
						},
						null,
						2
					)
				],
				{ type: 'application/json' }
			),
			'voice-measurements.json'
		);
	let lastFrame = 0;
	function animate(now: number) {
		const delta = Math.min(0.05, (now - lastFrame) / 1000 || 0);
		lastFrame = now;
		if (map.dimension === 3 && map.autoRotate && !map.drag) {
			map.yaw += delta * 0.065;
			map.invalidate();
		}
		for (const [side, el] of [
			['own', player],
			['ref', reference]
		] as [Side, HTMLAudioElement][]) {
			const range = state.ranges[side];
			if (range && !el.paused && el.currentTime >= range[1]) {
				el.pause();
				el.currentTime = range[1];
			}
		}
		const active = state.recording || !player.paused || !reference.paused;
		let ownTime = player.currentTime;
		if (state.recording && state.liveClock) {
			const live = state.liveClock;
			ownTime = Math.min(live.end, live.start + (now - live.at) / 1000);
		}
		map.draw({
			own: state.recording || !player.paused ? ownTime : undefined,
			target: !reference.paused ? reference.currentTime : undefined,
			animate: active
		});
		signal.draw({
			own: state.recording
				? Math.max(0, ownTime - ((state.ownFull?.duration || 0) - (state.own?.duration || 0)))
				: player.currentTime,
			ref: reference.currentTime,
			animate: active
		});
		if (state.recording && analyser) {
			const values = new Float32Array(analyser.fftSize);
			analyser.getFloatTimeDomainData(values);
			const elapsed = clock(samples / (recordContext?.sampleRate || 48000));
			$('timer').textContent = elapsed;
			$('live-time').textContent = elapsed;
			const rms = Math.sqrt(values.reduce((n, v) => n + v * v, 0) / values.length);
			$('live-mode').style.setProperty('--mic-level', String(Math.min(1, 0.15 + rms * 12)));
		}
		requestAnimationFrame(animate);
	}
	async function init() {
		requestAnimationFrame(animate);
		controls();
		const catalog = await api<{
			capabilities?: State['capabilities'];
			languages: LanguageOption[];
		}>('/api/catalog');
		state.capabilities = catalog.capabilities || {};
		$('words-button').hidden = state.capabilities.words === false;
		state.languages = catalog.languages;
		const view = readView();
		setLiveShapeWindow(view?.liveShapeSeconds);
		setTakeSort(view?.takeSort);
		const requested = location.pathname.split('/')[1] || 'ja',
			lang = catalog.languages.some((l) => l.id === requested) ? requested : 'ja';
		const [saved, storedRefs, index] = await Promise.all([
			TakeStore.read<{ current?: Snapshot; previous?: Snapshot } | undefined>().catch(() => null),
			TakeStore.read<Clip[] | undefined>('references').catch(() => []),
			TakeStore.read<Take[] | undefined>('recording-index').catch(() => [])
		]);
		state.imported = await loadImported<Clip & ImportClip>().catch((e) => {
			notify(e.message, true);
			return [];
		});
		state.takes = index || [];
		state.custom = (storedRefs || [])
			.filter((c) => c.pcm && favorites.has(c.id))
			.map((c) => ({ ...c, audio: URL.createObjectURL(wav(c.pcm!)) }));
		state.previousTake = saved?.previous?.pcm ? saved.previous : null;
		await loadLanguage(lang);
		if (saved?.current?.pcm && saved.current.id !== 'baseline') applySnapshot(saved.current);
		if (view && view.lang === lang) {
			$<HTMLSelectElement>('library-group').value = view.group || 'female';
			$<HTMLSelectElement>('sort').value = view.sort || 'high';
			$<HTMLInputElement>('search').value = view.search || '';
			openSpeakers.clear();
			for (const key of view.openSpeakers || []) openSpeakers.add(key);
			renderLibrary(true);
			const clip = state.clips.concat(state.custom).find((c) => c.id === view.reference);
			if (clip) await selectSample(clip, false);
			if (view.referenceRange) await selectRange('ref', view.referenceRange);
			map.dimension = view.dimension === 2 ? 2 : 3;
			map.projection =
				view.dimension === 2 && view.projection !== 'variance' ? 'contrast' : 'variance';
			for (const b of document.querySelectorAll<HTMLElement>('[data-dimension]'))
				b.setAttribute('aria-pressed', String(Number(b.dataset.dimension) === map.dimension));
			$('auto-rotate').hidden = map.dimension !== 3;
			for (const key of ['yaw', 'tilt', 'zoom'] as const)
				if (finite(view[key])) map[key] = view[key];
			for (const key of ['camera', 'center', 'pan'] as const)
				if (Array.isArray(view[key]) && view[key].every(finite)) map[key] = view[key];
			map.autoFit = false;
			map.autoRotate = !!view.autoRotate;
			$('auto-rotate').setAttribute('aria-pressed', String(map.autoRotate));
			signal.mode = (view.signal || 'pitch') as SignalMode;
			$<HTMLSelectElement>('signal-view').value = signal.mode;
			signal.overlay = view.overlay !== false;
			setSignalSource(view.signalSource === 'ref' ? 'ref' : 'own');
			map.invalidate();
			signal.dirty = true;
			syncProjection();
		}
		controls();
		sessionReady = true;
		(window as unknown as { voiceApp: unknown }).voiceApp = {
			state,
			// The browser suite's hold on measurements, where it intercepted the analyzer's
			// routes when the studio posted audio to it.
			measure: engine.gate,
			map,
			signal,
			fitValue,
			selectRange,
			selectSample,
			nearScores: () => {
				const ranking = similarRanking();
				return ranking ? Object.fromEntries(blendedOrder(ranking)) : null;
			},
			loadLanguage,
			controls,
			TakeStore,
			snapshotOwn,
			captureDebug: () => ({
				bufferSeconds: chunks.reduce((n, c) => n + c.length, 0) / (recordContext?.sampleRate || 1),
				monitoring: !!monitorGain && monitorGain.gain.value > 0,
				hasSnapshot: recordSnapshot !== null
			})
		};
	}

	function updateFavorite() {
		const yes = favorites.has(state.selected?.id as string);
		$('favorite-selected').textContent = yes ? '★' : '☆';
		$('favorite-selected').setAttribute('aria-pressed', String(yes));
		$('favorite-selected').setAttribute('aria-label', (yes ? m.favorite_remove : m.favorite_add)());
	}
	function toggleFavorite(id: string | undefined) {
		if (!id) return;
		if (favorites.has(id)) favorites.delete(id);
		else favorites.add(id);
		try {
			localStorage.setItem('voice-favorites', JSON.stringify([...favorites]));
		} catch {
			notify(m.error_favorite_save(), true);
		}
		TakeStore.write(
			// `custom` is $state.raw, so these clips are plain and need no snapshot.
			state.custom.filter((c) => favorites.has(c.id)).map(({ audio: _audio, ...c }) => c),
			'references'
		).catch(() => notify(m.error_reference_save(), true));
		updateFavorite();
		renderLibrary();
	}
	$('favorite-selected').onclick = () => toggleFavorite(state.selected?.id);

	$('auto-rotate').setAttribute('aria-pressed', String(map.autoRotate));
	$('auto-rotate').onclick = () => {
		map.autoRotate = !map.autoRotate;
		$('auto-rotate').setAttribute('aria-pressed', String(map.autoRotate));
		map.invalidate();
	};

	function clearOwn() {
		state.ownToken++;
		state.rangeToken.own++;
		state.wordToken.own++;
		state.ownTakeId = null;
		if (blobURL) {
			URL.revokeObjectURL(blobURL);
			blobURL = null;
		}
		state.own = state.ownFull = state.ownPCM = null;
		state.ownName = '';
		state.ownId = null;
		state.ranges.own = null;
		state.words.own = null;
		state.liveClock = null;
		signal.set('own', null);
		if (state.refFull) setSignalSource('ref');
		signal.live = false;
		map.live = false;
		map.fitDirty = true;
		player.removeAttribute('src');
		player.load();
		$('timer').textContent = '0:00';
		$('quality-state').hidden = true;
		updateMap();
		updateDistance();
		renderWords();
		controls();
		refreshNearOrder();
	}

	let takeChoices: (Snapshot | Take)[] = [],
		// The row of the current take in `takeChoices` (its checked row), or -1 without one.
		takeCurrentIndex = -1;
	/* The recording menu's order. A choice is sorted by its stored index entry (the current
	   and previous takes are snapshots that carry no date); a take without one is the
	   session's own audio, which counts as the newest. */
	const TAKE_SORTS = new Set<string>(['newest', 'oldest', 'name', 'longest']);
	let takeSort: TakeSort = 'newest';
	function sortTakeChoices(choices: (Snapshot | Take)[]) {
		const entry = (take: Snapshot | Take) =>
			state.takes.find((t) => t.id === ((take as Snapshot).takeId || take.storedId));
		const date = (take: Snapshot | Take) => entry(take)?.date ?? '\uffff';
		const length = (take: Snapshot | Take) =>
			(take as Snapshot).detail?.duration ?? (take as Take).duration ?? 0;
		const by: Record<TakeSort, (a: Snapshot | Take, b: Snapshot | Take) => number> = {
			newest: (a, b) => date(b).localeCompare(date(a)),
			oldest: (a, b) => date(a).localeCompare(date(b)),
			name: (a, b) => a.name.localeCompare(b.name, getLocale(), { numeric: true }),
			longest: (a, b) => length(b) - length(a)
		};
		return choices.slice().sort((a, b) => by[takeSort](a, b) || by.newest(a, b));
	}
	const takeSortControl = $<KoeSelectElement>('take-select').header!;
	function setTakeSort(sort: TakeSort | undefined) {
		takeSort = sort && TAKE_SORTS.has(sort) ? sort : 'newest';
		for (const button of takeSortControl.querySelectorAll('button')) {
			const on = button.dataset.sort === takeSort;
			button.setAttribute('aria-checked', String(on));
			button.part.toggle('pressed', on);
		}
	}
	takeSortControl.addEventListener('click', (e) => {
		const sort = (e.target as HTMLElement).closest('button')?.dataset.sort as TakeSort | undefined;
		if (!sort || sort === takeSort) return;
		setTakeSort(sort);
		renderTakeMenu();
		saveView();
	});
	/* 64 bucket maxima of the samples, scaled to the loudest bucket, for the take rows' preview. */
	const wavePeaks = (pcm: PCM | null | undefined, buckets = 64): number[] | null => {
		if (!pcm?.length) return null;
		const peaks: number[] = Array.from({ length: buckets }),
			size = Math.max(1, Math.floor(pcm.length / buckets));
		for (let i = 0; i < buckets; i++) {
			let peak = 0;
			for (let j = i * size, e = Math.min((i + 1) * size, pcm.length); j < e; j += 8) {
				const v = Math.abs(pcm[j]);
				if (v > peak) peak = v;
			}
			peaks[i] = peak;
		}
		const top = Math.max(...peaks) || 1;
		return peaks.map((v) => Math.round((v / top) * 100) / 100);
	};
	const backfilledPeaks = new Set<string>();
	async function backfillPeaks() {
		for (const t of state.takes) {
			if (!t.stored || t.peaks || backfilledPeaks.has(t.id)) continue;
			backfilledPeaks.add(t.id);
			const snapshot = await TakeStore.read<Snapshot | undefined>('recording:' + t.id).catch(
				() => null
			);
			const peaks = snapshot?.pcm ? wavePeaks(snapshot.pcm) : null;
			if (!peaks) continue;
			const saved = await TakeStore.updateRecording<Take>(t.id, (stored, metadata) => ({
				snapshot: stored,
				metadata: { ...metadata!, peaks }
			})).catch(() => null);
			if (saved?.index) {
				state.takes = saved.index;
				renderTakeMenu();
			}
		}
	}
	function renderTakeMenu() {
		const select = $<HTMLSelectElement>('take-select');
		if (!select) return;
		const current = state.recording ? recordSnapshot : snapshotOwn(),
			seen = new Set<string>();
		takeChoices = [];
		for (const take of [
			current,
			state.previousTake,
			...state.takes.filter((t) => t.stored).map((t) => ({ ...t, storedId: t.id }))
		] as (Snapshot | Take | null | undefined)[]) {
			if (!take?.pcm && !take?.storedId) continue;
			const key =
				(take as Snapshot).takeId ||
				take.storedId ||
				take.name + ':' + take.pcm!.length + ':' + (take as Snapshot).detail.features.f0;
			if (seen.has(key)) continue;
			seen.add(key);
			takeChoices.push(take);
		}
		takeChoices = sortTakeChoices(takeChoices);
		for (const option of select.options) option.remove();
		takeChoices.forEach((t, i) => {
			const option = new Option(t.name, String(i));
			option.dataset.detail = clock((t as Snapshot).detail?.duration || (t as Take).duration);
			option.dataset.actions = 'play,rename,download,delete';
			option.dataset.key = takeKeyOf(t);
			const peaks = t.pcm ? wavePeaks(t.pcm) : (t as Take).peaks;
			if (peaks) option.dataset.peaks = JSON.stringify(peaks);
			if (state.recording || !((t as Snapshot).takeId || t.storedId))
				option.dataset.disabledActions = 'delete' + (state.recording ? ',play,rename' : '');
			select.add(option);
		});
		if (current?.detail?.analysisPending && !state.analyzing.has(current.takeId!))
			select.add(new Option(m.takes_retry(), 'retry'));
		select.disabled = state.busy || !takeChoices.length;
		takeCurrentIndex = current?.pcm ? takeChoices.indexOf(current) : -1;
		select.value = takeCurrentIndex < 0 ? '' : String(takeCurrentIndex);
		select.setAttribute('data-display-label', current?.name || m.takes_menu());
		void backfillPeaks();
	}
	async function restoreTake(chosen: Snapshot | Take | { storedId: string }) {
		if (state.busy) return;
		if ((chosen as Take).storedId)
			chosen = (await TakeStore.read<Snapshot>('recording:' + (chosen as Take).storedId))!;
		if (!(chosen as Snapshot)?.pcm) throw new Error(m.error_take_load());
		const current = state.recording ? recordSnapshot : snapshotOwn();
		if (state.recording) await cancelCapture();
		cancelAB();
		player.pause();
		reference.pause();
		stopReplay();
		applySnapshot(chosen as Snapshot);
		state.previousTake = current || null;
		await persistTakes();
		saveView();
		controls();
	}
	async function deleteTake(take: Partial<Snapshot & Take> | undefined) {
		const id = take?.takeId || take?.storedId;
		if (state.busy || state.recording || !id) return;
		const current = id === state.ownTakeId;
		state.busy = true;
		stopReplay();
		controls();
		try {
			state.takes = await TakeStore.deleteRecording<Take>(id);
			if (state.previousTake?.takeId === id) state.previousTake = null;
			if (recordSnapshot?.takeId === id) recordSnapshot = null;
			if (current) {
				cancelAB();
				player.pause();
				clearOwn();
				const next =
					state.previousTake ||
					(state.takes.length
						? await TakeStore.read<Snapshot>('recording:' + state.takes[0].id)
						: null);
				if (next?.pcm) applySnapshot(next);
				state.previousTake = null;
			}
			await TakeStore.write(snap({ current: snapshotOwn(), previous: state.previousTake || null }));
			updateMap();
			saveView();
			notify(m.notice_take_deleted());
		} catch {
			notify(m.error_take_delete(), true);
		} finally {
			state.busy = false;
			controls();
			queueMicrotask(() => {
				const menu = $<HTMLSelectElement>('take-select');
				if (document.activeElement === document.body || document.activeElement === menu)
					(menu.disabled
						? $('record')
						: (menu.shadowRoot!.querySelector('.trigger') as HTMLElement)
					).focus();
			});
		}
	}
	$('take-select').onchange = async (e) => {
		const value = (e.target as HTMLSelectElement).value;
		if (value === '') return;
		if (value === 'retry') {
			await retryAnalysis();
			return;
		}
		const chosen = takeChoices[Number(value)];
		// The current take chosen again is nothing to restore (it would become its own
		// previous take); the menu just closes. While recording, that row is the capture,
		// and choosing it cancels the capture as any row does.
		if (!chosen || (!state.recording && Number(value) === takeCurrentIndex)) return;
		try {
			await restoreTake(chosen);
		} catch (error) {
			notify((error as Error).message, true);
		}
	};
	$('take-select').addEventListener('optionaction', async (e) => {
		const detail = (e as CustomEvent<{ value: string; action: string }>).detail;
		let chosen: Snapshot | Take | undefined = takeChoices[Number(detail.value)];
		if (!chosen) return;
		if (detail.action === 'delete') {
			await deleteTake(chosen as Partial<Snapshot & Take>);
			return;
		}
		if (detail.action === 'play')
			try {
				const source = chosen.pcm
					? chosen
					: await TakeStore.read<Snapshot>('recording:' + chosen.storedId);
				if (!source?.pcm) throw new Error(m.error_take_load());
				replayTake(source as Snapshot, replayKeyOf(chosen));
			} catch (error) {
				notify((error as Error).message, true);
				return;
			}
		if (detail.action === 'download')
			try {
				if (chosen.storedId)
					chosen = (await TakeStore.read<Snapshot>('recording:' + chosen.storedId))!;
				if (!chosen?.pcm) throw new Error(m.error_take_load());
				download(wav(chosen.pcm), chosen.name.replace(/\.[^.]+$/, '') + '.wav');
			} catch (error) {
				notify((error as Error).message, true);
			}
	});

	/* Row-level replay and renaming in the recording history. */
	let replayAudio: HTMLAudioElement | null = null,
		replayKey: string | null = null;
	// One identity per take: a recording's takeId, a stored take's storedId, else a memory
	// take keyed by its name and length. Used for the menu's data-key, the replay state, and
	// the wave button's row key, so all three agree.
	const takeKeyOf = (take: Snapshot | Take | null | undefined) =>
		(take as Snapshot)?.takeId ||
		take?.storedId ||
		'mem:' + (take?.name || '') + ':' + (take?.pcm?.length || 0);
	const replayKeyOf = takeKeyOf;
	const setReplaying = (key: string, playing: boolean, progress = 0) =>
		$<KoeSelectElement>('take-select').setRowPlaying(key, playing, progress);
	function stopReplay() {
		const was = replayKey;
		if (replayAudio) {
			URL.revokeObjectURL(replayAudio.src);
			replayAudio.pause();
		}
		replayAudio = null;
		replayKey = null;
		if (was) setReplaying(was, false);
	}
	function replayTake(take: Snapshot, key: string) {
		const stop = replayKey === key;
		stopReplay();
		if (stop) return;
		const url = URL.createObjectURL(wav(take.pcm!));
		// Keep this run's element to compare identity: a take's key can come round again
		// (play, stop, play), so only the element itself tells this replay from its successor.
		const audio = (replayAudio = new Audio(url));
		replayKey = key;
		setReplaying(key, true);
		audio.ontimeupdate = () => {
			if (replayAudio === audio && finite(audio.duration))
				setReplaying(key, true, audio.currentTime / audio.duration);
		};
		audio.onended = () => {
			URL.revokeObjectURL(url);
			if (replayAudio !== audio) return;
			replayKey = null;
			setReplaying(key, false);
			replayAudio = null;
		};
		audio.play().catch((e) => {
			// A stop or a switch to another take pauses this audio, so its play() rejects with
			// AbortError; that is the stop taking effect. A replay this element no longer drives
			// (a newer one took over) is not ours to report either.
			if ((e as DOMException).name === 'AbortError' || replayAudio !== audio) return;
			stopReplay();
			URL.revokeObjectURL(url);
			notify(m.error_replay(), true);
		});
	}
	// The recording menu renames a take in place: koe-select emits `optionrename` with the
	// take and its new name; the same storage path persists it, and the shown name rolls
	// back (a re-render) if the write fails.
	$('take-select').addEventListener('optionrename', async (e) => {
		// A rename mid-recording or mid-analysis is ignored (a re-render then drops the input);
		// the take is found by its stable key, not its row position, which a re-render shifts.
		if (state.recording || state.busy) return;
		const detail = (e as CustomEvent<{ value: string; key: string; name: string }>).detail;
		const take =
			takeChoices.find((c) => takeKeyOf(c) === detail.key) || takeChoices[Number(detail.value)];
		if (!take) return;
		const id = (take as Snapshot).takeId || take.storedId;
		if (!id) {
			// Only the current take can lack an id (audio not saved yet); an id-less row
			// elsewhere has nothing to rename and rolls back.
			if (takeChoices.indexOf(take) === takeCurrentIndex) {
				state.ownName = detail.name;
				await persistTakes();
			} else notify(m.rename_failed(), true);
			renderTakeMenu();
			return;
		}
		try {
			// The stored snapshot carries the name too: a later restore reads it, not the index.
			const saved = await TakeStore.updateRecording<Take>(id, (snapshot, metadata) => ({
				snapshot: { ...snapshot, name: detail.name },
				metadata: { ...metadata!, name: detail.name }
			}));
			if (!saved) throw 0;
			state.takes = saved.index;
			// The current and previous takes are held as snapshots with names of their own,
			// which the menu shows ahead of the stored entry; they follow the rename.
			if (state.previousTake?.takeId === id)
				state.previousTake = { ...state.previousTake, name: detail.name };
			if (state.ownTakeId === id) state.ownName = detail.name;
			if (state.ownTakeId === id || state.previousTake?.takeId === id) await persistTakes();
			renderTakeMenu();
		} catch {
			notify(m.rename_failed(), true);
			renderTakeMenu();
		}
	});

	/* Bulk actions on the recording history: one zip of every saved take, or delete them all. */
	async function storedTakes() {
		const out: (Take & { pcm: PCM })[] = [];
		for (const t of state.takes) {
			if (!t.stored) continue;
			const rec = await TakeStore.read<Snapshot | undefined>('recording:' + t.id).catch(() => null);
			if (rec?.pcm) out.push({ ...t, pcm: rec.pcm });
		}
		return out;
	}
	$('download-all').onclick = async () => {
		if (state.busy || state.recording) return;
		state.busy = true;
		controls();
		try {
			const takes = await storedTakes();
			if (!takes.length) throw new Error(m.error_no_takes());
			const { ZipWriter, BlobWriter, BlobReader, TextReader } =
				await import('@zip.js/zip.js/index-native.js');
			const zip = new ZipWriter(new BlobWriter('application/zip')),
				used = new Set<string>(),
				manifest: unknown[] = [];
			for (const [i, t] of takes.entries()) {
				let name = (t.name || 'take').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_');
				if (used.has(name)) name += '-' + (i + 1);
				used.add(name);
				await zip.add(name + '.wav', new BlobReader(wav(t.pcm)));
				manifest.push({
					file: name + '.wav',
					id: t.id,
					name: t.name,
					date: t.date,
					duration: t.duration,
					features: t.features
				});
			}
			await zip.add('takes.json', new TextReader(JSON.stringify(manifest, null, 1)));
			download(await zip.close(), 'koenami-recordings.zip');
			notify(m.notice_zipped({ n: takes.length }));
		} catch (error) {
			notify((error as Error).message, true);
		} finally {
			state.busy = false;
			controls();
		}
	};
	$('delete-all').onclick = async () => {
		if (state.busy || state.recording) return;
		const stored = state.takes.filter((t) => t.stored);
		if (!stored.length) {
			notify(m.error_no_takes());
			return;
		}
		if (!confirm(m.confirm_delete_all({ n: stored.length }))) return;
		for (const t of stored) await deleteTake({ storedId: t.id });
		notify(m.notice_deleted_all({ n: stored.length }));
	};

	let importController: AbortController | null = null;
	$('add-reference').onclick = () => {
		$('jvs-status').textContent = state.imported.length
			? m.jvs_added({ n: state.imported.length })
			: '';
		$<HTMLDialogElement>('import-dialog').showModal();
	};
	$('import-audio').onclick = () => {
		$<HTMLDialogElement>('import-dialog').close();
		$('reference-upload').click();
	};
	$('choose-jvs-zip').onclick = () => $('jvs-zip').click();
	$('choose-jvs-folder').onclick = () => $('jvs-folder').click();
	$('cancel-jvs').onclick = () => importController?.abort();
	$('import-dialog').addEventListener('close', () => importController?.abort());
	async function addJVS(files: FileList) {
		if (!files.length || state.busy || state.recording) return;
		state.busy = true;
		controls();
		cancelAB();
		player.pause();
		reference.pause();
		const controller = (importController = new AbortController());
		for (const id of ['choose-jvs-zip', 'choose-jvs-folder', 'import-audio'])
			$<HTMLButtonElement>(id).disabled = true;
		$('cancel-jvs').hidden = false;
		$('jvs-progress').hidden = false;
		try {
			const result = await importJVS(
				[...files],
				(done, total) => {
					const pct = (100 * done) / total;
					$('jvs-progress').setAttribute('aria-valuenow', String(Math.round(pct)));
					($('jvs-progress').firstElementChild as HTMLElement).style.width = pct + '%';
					$('jvs-status').textContent =
						`${done.toLocaleString(getLocale())} / ${total.toLocaleString(getLocale())}`;
				},
				controller.signal
			);
			$('jvs-status').textContent = m.jvs_added({ n: result.total });
		} catch (e) {
			$('jvs-status').textContent =
				(e as Error).name === 'AbortError' ? m.jvs_cancelled() : (e as Error).message;
		} finally {
			importController = null;
			state.busy = false;
			state.imported = await loadImported<Clip & ImportClip>().catch(() => state.imported);
			if (state.lang === 'ja') await loadLanguage('ja');
			for (const id of ['choose-jvs-zip', 'choose-jvs-folder', 'import-audio'])
				$<HTMLButtonElement>(id).disabled = false;
			$('cancel-jvs').hidden = true;
			$('jvs-progress').hidden = true;
			controls();
			$<HTMLInputElement>('jvs-zip').value = '';
			$<HTMLInputElement>('jvs-folder').value = '';
		}
	}
	$('jvs-zip').onchange = (e) => addJVS((e.target as HTMLInputElement).files!);
	$('jvs-folder').onchange = (e) => addJVS((e.target as HTMLInputElement).files!);

	let sessionReady = false;
	function readView(): View | null {
		try {
			return JSON.parse(localStorage.getItem('koenami-session') || 'null');
		} catch {
			return null;
		}
	}
	function saveView() {
		if (!sessionReady) return;
		try {
			localStorage.setItem(
				'koenami-session',
				JSON.stringify({
					lang: state.lang,
					group: $<HTMLSelectElement>('library-group').value,
					sort: $<HTMLSelectElement>('sort').value,
					search: $<HTMLInputElement>('search').value,
					reference: state.selected?.id,
					referenceRange: state.ranges.ref,
					openSpeakers: [...openSpeakers],
					dimension: map.dimension,
					projection: map.projection,
					yaw: map.yaw,
					tilt: map.tilt,
					zoom: map.zoom,
					camera: map.camera,
					center: map.center,
					pan: map.pan,
					autoRotate: map.autoRotate,
					signal: signal.mode,
					signalSource: signal.source,
					overlay: signal.overlay,
					liveShapeSeconds: map.liveShapeSeconds,
					...(takeSort !== 'newest' && { takeSort })
				})
			);
		} catch {}
	}
	setInterval(saveView, 1000);
	window.addEventListener('beforeunload', saveView);
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			saveView();
			void persistTakes();
		}
	});

	function restoreCamera() {
		if (!recordCamera) return;
		if (map.navigationVersion === recordCamera.navigationVersion) {
			map.autoFit = recordCamera.autoFit;
			map.autoRotate = recordCamera.autoRotate;
		}
		recordCamera = null;
		map.fitDirty = true;
		map.invalidate();
		$('auto-rotate').setAttribute('aria-pressed', String(map.autoRotate));
	}
	/* Every stored take of the current language that has a verdict, oldest first; the chart and list share the rows. */
	function historyRows() {
		const scorer = state.scorer,
			lang = state.lang === 'lab' ? 'en' : state.lang;
		if (!scorer?.available) return [];
		return state.takes
			.filter(
				(t) =>
					t.stored && t.language === lang && t.features && !(t.quality && gateFailure(t.quality))
			)
			.map((t) => ({ take: t, result: scorer.score(t.features!), unchecked: !t.quality }))
			.filter((r): r is { take: Take; result: ScoreResult; unchecked: boolean } => !!r.result)
			.sort((a, b) => a.take.date.localeCompare(b.take.date));
	}
	function renderHistory(_current: ScoreResult) {
		const rows = historyRows(),
			section = $('share-history');
		section.hidden = rows.length < 2;
		if (section.hidden) return;
		const bands = state.scorer!.bands,
			W = 480,
			H = 110,
			L = 30,
			R = 8,
			T = 8,
			B = 18,
			y = (s: number) =>
				T +
				(H - T - B) * (1 - (clamp(s, -SCALE_LIMIT, SCALE_LIMIT) + SCALE_LIMIT) / (2 * SCALE_LIMIT)),
			x = (i: number) => L + (W - L - R) * (rows.length > 1 ? i / (rows.length - 1) : 0.5);
		const band = (g: 'male' | 'female', color: string) =>
			`<rect x="${L}" y="${y(bands[g][1])}" width="${W - L - R}" height="${Math.max(1, y(bands[g][0]) - y(bands[g][1]))}" fill="${color}" opacity=".18"/>`;
		const points = rows.map((r, i) => [x(i), y(r.result.score)]);
		const day = (d: string) =>
			new Date(d).toLocaleDateString(getLocale(), { month: 'numeric', day: 'numeric' });
		$('history-chart').innerHTML =
			`${band('male', 'var(--sky)')}${band('female', 'var(--pink)')}<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>${[100, 50, 0, -50, -100].map((v) => `<text x="${L - 6}" y="${y(v) + 3}" font-size="8" text-anchor="end" fill="var(--muted)">${formatScore(v)}</text>`).join('')}<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--self)" stroke-width="1.5"/>${points.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="${rows[i].take.id === state.ownTakeId ? 4 : 2.5}" fill="var(--self)" stroke="var(--surface)" stroke-width="1"/>`).join('')}<text x="${L}" y="${H - 4}" font-size="8" fill="var(--muted)">${day(rows[0].take.date)}</text><text x="${W - R}" y="${H - 4}" font-size="8" text-anchor="end" fill="var(--muted)">${day(rows.at(-1)!.take.date)}</text>`;
		$('history-list').replaceChildren(
			...[...rows].reverse().map((r) => {
				const li = document.createElement('li');
				li.setAttribute('aria-current', String(r.take.id === state.ownTakeId));
				const when = new Date(r.take.date);
				li.innerHTML = `<span class="history-name">${esc(r.take.name)}</span><time datetime="${esc(r.take.date)}">${when.toLocaleDateString(getLocale(), { month: 'numeric', day: 'numeric' })} ${when.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</time><span class="history-verdict" data-verdict="${r.result.verdict}">${verdictLabel(r.result.verdict)}</span><b>${formatScore(r.result.display)}</b>`;
				const b = document.createElement('button');
				if (r.take.id === state.ownTakeId) {
					b.textContent = m.history_current();
					b.disabled = true;
				} else {
					b.textContent = m.history_open();
					b.title = m.history_open_title();
					b.onclick = () => {
						$<HTMLDialogElement>('share-dialog').close();
						restoreTake({ storedId: r.take.id }).catch((e) => notify(e.message, true));
					};
				}
				li.append(b);
				return li;
			})
		);
		$('history-note').hidden = !rows.some((r) => r.unchecked);
	}
	let shareImage: File | null = null;
	const ageEstimates = new Map<string, { estimate: number; windowRange: [number, number] }>();
	$('verdict-readout').onclick = () => $('share-button').click();
	$('verdict-help').onclick = () => {
		const s = state.scorer;
		openHelp(
			VERDICT_HELP,
			s?.available
				? [
						[
							m.help_male_band(),
							m.help_band_range({
								low: formatScore(Math.round(s.bands.male[0])),
								high: formatScore(Math.round(s.bands.male[1]))
							})
						],
						[
							m.help_female_band(),
							m.help_band_range({
								low: formatScore(Math.round(s.bands.female[0])),
								high: formatScore(Math.round(s.bands.female[1]))
							})
						],
						[m.help_speakers(), s.speakers.length]
					]
				: []
		);
	};
	$('share-button').onclick = async () => {
		const scored = state.shareResult;
		if (!scored) return;
		const scorer = state.scorer!,
			lang = state.lang === 'lab' ? 'en' : state.lang;
		const ageKey = state.ownTakeId || state.ownId || state.ownName,
			cachedAge = ageEstimates.get(ageKey);
		let result: ScoreResult = {
				...scored,
				age:
					cachedAge && $<HTMLInputElement>('share-age-include').checked
						? cachedAge.estimate
						: undefined
			},
			bundle = shareBundle(result, scorer, lang);
		$('share-verdict').textContent = verdictLabel(result.verdict);
		$('share-verdict').dataset.verdict = result.verdict;
		$('share-score').querySelector('strong')!.textContent = formatScore(result.display);
		$('share-score').querySelector('span')!.textContent = leaningLabel(result.verdict);
		const applyBundle = () => {
			$('share-intents').replaceChildren(
				...bundle.intents.map((i) => {
					const a = document.createElement('a');
					a.href = i.href;
					a.target = '_blank';
					a.rel = 'noopener noreferrer';
					a.innerHTML = labelled(i.icon, i.label);
					a.title = m.share_post_to({ name: i.label });
					return a;
				})
			);
			$<HTMLAnchorElement>('share-open').href = bundle.url;
		};
		applyBundle();
		$('share-open').innerHTML = labelled('external', m.share_open());
		$('share-system').innerHTML = labelled('share', m.share_system());
		$('share-copy').innerHTML = labelled('link', m.share_copy());
		$('share-save').innerHTML = labelled('image', m.share_save());
		$('share-status').textContent = '';
		$('share-image').hidden = true;
		$('share-copy').onclick = async () => {
			try {
				await navigator.clipboard.writeText(bundle.url);
				$('share-status').textContent = m.share_copied();
			} catch {
				$('share-status').textContent = bundle.url;
			}
		};
		$('share-system').hidden = !navigator.share;
		$('share-system').onclick = () =>
			systemShare(result, scorer, lang).catch((e) => {
				if (e.name !== 'AbortError') $('share-status').textContent = e.message;
			});
		shareImage = null;
		const render = async () => shareImage || (shareImage = await cardImage(result, scorer));
		const showAge = () => {
			const a = ageEstimates.get(ageKey);
			$('share-age-value').textContent = a
				? m.share_age_value({
						age: ageText(a.estimate),
						low: Math.round(a.windowRange[0]),
						high: Math.round(a.windowRange[1])
					})
				: '';
			$('share-age-run').hidden = !!a;
			$('share-age-include-label').hidden = !a;
		};
		showAge();
		const refresh = async () => {
			const a = ageEstimates.get(ageKey);
			result = {
				...scored,
				age: a && $<HTMLInputElement>('share-age-include').checked ? a.estimate : undefined
			};
			bundle = shareBundle(result, scorer, lang);
			applyBundle();
			shareImage = null;
			try {
				const file = await render();
				if (!$<HTMLDialogElement>('share-dialog').open) return;
				const img = $<HTMLImageElement>('share-image');
				if (img.src) URL.revokeObjectURL(img.src);
				img.src = URL.createObjectURL(file);
			} catch (e) {
				$('share-status').textContent = (e as Error).message;
			}
		};
		$('share-age-include').onchange = refresh;
		$('share-age-run').onclick = async () => {
			if (!state.ownPCM) return;
			const r = state.ranges.own,
				pcm = r
					? state.ownPCM.slice(Math.round(r[0] * 16000), Math.round(r[1] * 16000))
					: state.ownPCM;
			$<HTMLButtonElement>('share-age-run').disabled = true;
			$('share-age-run').textContent = m.share_age_running();
			try {
				const a = await api<{ estimate: number; windowRange: [number, number] }>('/api/age', {
					method: 'POST',
					body: pcm
				});
				ageEstimates.set(ageKey, a);
				showAge();
				$<HTMLInputElement>('share-age-include').checked = false;
			} catch (e) {
				$('share-status').textContent = (e as Error).message;
			} finally {
				$<HTMLButtonElement>('share-age-run').disabled = false;
				$('share-age-run').textContent = m.share_age_run();
			}
		};
		$('share-save').onclick = async () => {
			try {
				download(await render(), `koenami-${result.display}.png`);
			} catch (e) {
				$('share-status').textContent = (e as Error).message;
			}
		};
		renderHistory(result);
		$<HTMLDialogElement>('share-dialog').showModal();
		try {
			const file = await render();
			if (!$<HTMLDialogElement>('share-dialog').open) return;
			const img = $<HTMLImageElement>('share-image');
			if (img.src) URL.revokeObjectURL(img.src);
			img.src = URL.createObjectURL(file);
			img.alt = m.share_image_alt({ text: bundle.text });
			img.hidden = false;
		} catch (e) {
			$('share-status').textContent = (e as Error).message;
		}
	};
	init().catch((e) => notify(m.error_load({ message: e.message }), true));
	return () => {
		alive = false;
	};
}
