import captureUrl from '$lib/capture?worker&url';
import { loadImported, importedAudio, importJVS, type ImportClip } from '$lib/corpus-import';
/* The studio: one controller over the page's elements, ported from web/app.js with types.
   Its DOM writes, request order and timing are what the browser goldens pin. */
import { defineKoeSelect } from '$lib/koe-select';
import { VoiceMap, type MapSample } from '$lib/map';
import { finite, quantile, clamp, AXES } from '$lib/math';
import * as engine from '$lib/measure/engine';
import {
	Scorer,
	VERDICTS,
	LEANINGS,
	formatScore,
	gateFailure,
	representatives,
	type ScoreResult
} from '$lib/score';
import { shareBundle, cardImage, systemShare, labelled } from '$lib/share';
import { SignalView, type Side, type SignalMode } from '$lib/signals';
import { AcousticSpace, type Features } from '$lib/space';
import { TakeStore } from '$lib/storage';

import type { Clip, Detail, PCM, Snapshot, Take, View, Words } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T,
	esc = (s: string | number | null | undefined) =>
		String(s ?? '').replace(
			/[&<>"']/g,
			(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
		);
const fmt = (v: unknown, n = 0) => (finite(v) ? v.toFixed(n) : '—');
const clock = (t: number | undefined | null) =>
	`${Math.floor((t || 0) / 60)}:${String(Math.floor((t || 0) % 60)).padStart(2, '0')}`;
const icon = (el: Element, name: string) =>
	el.querySelector('use')?.setAttribute('href', '#i-' + name);
type Metric = {
	key: keyof Features;
	label: string;
	unit: string;
	n: number;
	description: string;
	factors: string[];
	caveats: string[];
};
const METRICS: Metric[] = [
	{
		key: 'f0',
		label: '高さ',
		unit: 'Hz',
		n: 0,
		description:
			'声帯の振動の速さです。有声音の基本周波数（F0）の中央値を使います。値が大きいほど高い声です。帯は参照グループの見本の中央80%を示します。',
		factors: [
			'声帯の張り（喉頭の筋肉の使い方）と声帯の質量',
			'喉頭の高さ、息の量、力み',
			'文の種類と感情。疑問文や強調では上がります'
		],
		caveats: [
			'高さだけでは性別の印象は決まりません。同じ高さでも響きで印象が変わります（<a href="https://doi.org/10.5112/jjlp.50.14" target="_blank" rel="noreferrer">櫻庭ほか 2009</a>）。',
			'息の音や機械音を拾うと極端な値になります。マイクから10〜20cm離し、静かな場所で試してください。'
		]
	},
	{
		key: 'delta_f',
		label: '響き',
		unit: 'Hz ΔF',
		n: 0,
		description:
			'最初の4つのフォルマントから求めた間隔です。大きいほど、声道が小さく明るい響きに対応する傾向があります。母音でも変わるので、同じ言葉で比べると違いがわかりやすくなります。',
		factors: [
			'喉頭の高さ（上げると声道が短くなり、値が上がります）',
			'口の開き、舌の位置、唇の形',
			'母音。「い」と「あ」では同じ人でも大きく違います'
		],
		caveats: [
			'推定値です。短い録音や雑音では安定せず、解析設定でも動きます。',
			'母音の違いが響きの違いに見えることがあります。同じ言葉、できれば同じ母音で比べてください。'
		]
	},
	{
		key: 'hnr',
		label: '質感',
		unit: 'dB',
		n: 1,
		description:
			'声の周期成分と雑音成分の比（HNR）です。小さい値には息やかすれが関係することがありますが、録音の雑音にも左右されます。声の重さを直接測る指標ではありません。',
		factors: ['息漏れ（声帯の閉じ方）', 'かすれ、がらつき', '録音の雑音。環境音が多いと下がります'],
		caveats: [
			'声の「重さ」や「太さ」の指標ではありません。',
			'静かな部屋で録った見本と、雑音のある自分の録音を直接比べると、雑音の分だけ低く出ます。'
		]
	},
	{
		key: 'balance',
		label: '明るさ',
		unit: 'dB',
		n: 1,
		description:
			'100〜1,000 Hzに対する1,000〜4,000 Hzの音の強さです。大きいほど高域の成分が多くなります。母音、息の量、マイクの特性も影響します。',
		factors: [
			'口の開きと舌の位置',
			'息の量と声帯の閉じ方',
			'マイクの位置と特性、ブラウザーの音声処理'
		],
		caveats: [
			'機材に強く依存します。録音条件が違う音声どうしでは比べにくい指標です。',
			'見本との差より、同じ機材で録った自分の録音どうしの変化を見るのに向いています。'
		]
	},
	{
		key: 'pitch_span',
		label: '抑揚',
		unit: '半音',
		n: 1,
		description:
			'声の高さの10〜90パーセンタイルの幅です。女性的な印象に関連する場面もありますが、大きければよいとは限りません。日本語のアクセント、中国語の声調、文の種類、感情で変わります。標準偏差や間の取り方はレポートで確認できます。',
		factors: [
			'文の種類と感情',
			'言語。日本語のアクセント、中国語の声調で幅が変わります',
			'録音の長さ。長いほど幅が広がりやすくなります'
		],
		caveats: [
			'大きいほど良いわけではありません。',
			'長さの違う録音は比べにくいので、同じ文か短い句で比べてください。'
		]
	}
];
const VERDICT_HELP = {
	label: '声の判定',
	description:
		'5つの指標を、女性的な声と男性的な声の見本が最も離れる方向（男女差の軸）に投影した位置です。0は両方の見本の中央値のちょうど中間、−25は男性的な見本の中央値、+25は女性的な見本の中央値です。',
	factors: [
		'上の5指標すべて。特に高さと響きの寄与が大きくなります',
		'見本の言語。言語ごとに見本が違うので、言語をまたいで数値は比べられません'
	],
	caveats: [
		'聞き手の評価ではなく、音響指標の位置です。校正は行っていません。',
		'短い録音や雑音の多い録音では安定しません。同じ文を何度か録音して見比べてください。',
		'どちらの向きも、また0に近づけることも、目標として扱います。'
	]
};

type State = {
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

export function mountStudio() {
	defineKoeSelect();
	let favorites = new Set<string>();
	try {
		favorites = new Set(JSON.parse(localStorage.getItem('voice-favorites') || '[]'));
	} catch {}
	const state: State = {
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
	};
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
	async function api<T = Detail>(url: string, options?: RequestInit): Promise<T> {
		const r = await fetch(url, options);
		if (!r.ok) throw new Error((await r.text()).slice(0, 200) || `Request failed (${r.status})`);
		return r.json();
	}
	function setTheme(value: string) {
		try {
			localStorage.setItem('voice-theme', value);
		} catch {}
		document.documentElement.dataset.theme =
			value === 'system'
				? matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light'
				: value;
		$<HTMLSelectElement>('theme-select').value = value;
		icon($('theme-button'), document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
		map.invalidate();
		signal.dirty = true;
	}
	$('theme-button').onclick = () =>
		setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
	$('theme-select').onchange = (e) => setTheme((e.target as HTMLSelectElement).value);
	try {
		$<HTMLSelectElement>('theme-select').value = localStorage.getItem('voice-theme') || 'system';
	} catch {}
	icon($('theme-button'), document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon');
	for (const name of ['settings', 'info'])
		$(name + '-button').onclick = () => {
			$<HTMLDialogElement>(name + '-dialog').showModal();
		};
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
	function referenceGroup() {
		return state.selected?.group === 'male' ? 'male' : 'female';
	}
	function referenceGroupLabel() {
		return referenceGroup() === 'male' ? '男性的な声' : '女性的な声';
	}
	function referenceStats() {
		return state.representatives.filter((c) => c.group === referenceGroup());
	}
	let fitModel: {
		model: AcousticSpace;
		loo: number[];
		density: (v: number[], exclude?: number) => number;
		count: number;
	} | null = null;
	function buildFit() {
		const refs = referenceStats().filter((c) => AcousticSpace.raw(c.features).every(finite));
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
	/* One dialog for every ?: definition, the numbers, what moves the value, and what it cannot tell. */
	function openHelp(
		entry: { label: string; description: string; factors: string[]; caveats: string[] },
		rows: [string, string | number][] = []
	) {
		$('metric-title').textContent = entry.label;
		$('metric-description').textContent = entry.description;
		$('metric-details').innerHTML = rows
			.map(
				([a, b]) => `<div class="metric-detail-row"><span>${a}</span><strong>${b}</strong></div>`
			)
			.join('');
		$('metric-factors').innerHTML = entry.factors.map((x) => `<li>${x}</li>`).join('');
		$('metric-caveats').innerHTML = entry.caveats.map((x) => `<li>${x}</li>`).join('');
		$<HTMLDialogElement>('metric-dialog').showModal();
	}
	function updateIndicators() {
		const focused = (document.activeElement as HTMLElement | null)?.dataset?.metric;
		const f = activeFeatures('own'),
			target = activeFeatures('ref'),
			refs = referenceStats();
		$('indicators').replaceChildren();
		for (const m of METRICS) {
			const values = refs.map((s) => s.features[m.key]).filter(finite);
			let lo = quantile(values, 0.01),
				hi = quantile(values, 0.99);
			if (!finite(lo) || hi <= lo) {
				lo = AXES[m.key].min;
				hi = AXES[m.key].max;
			}
			lo = Math.min(lo, f[m.key] ?? lo, target[m.key] ?? lo);
			hi = Math.max(hi, f[m.key] ?? hi, target[m.key] ?? hi);
			const pos = (v: number) => clamp(((v - lo) / (hi - lo || 1)) * 100, 0, 100),
				q1 = quantile(values, 0.1),
				q9 = quantile(values, 0.9);
			const b = document.createElement('button');
			b.className = 'indicator';
			b.dataset.metric = m.key;
			b.title = `${m.label}: 自分 ${fmt(f[m.key], m.n)} ${m.unit}・見本 ${fmt(target[m.key], m.n)} ${m.unit}`;
			b.setAttribute('aria-label', b.title);
			b.innerHTML = `<span class="indicator-heading">${m.label}<svg aria-hidden="true"><use href="#i-info"></use></svg></span><span class="indicator-values"><strong>${fmt(f[m.key], m.n)}</strong><small>${m.unit}</small><em>${fmt(target[m.key], m.n)}</em></span><span class="indicator-track">${finite(q1) ? `<span class="indicator-band" style="left:${pos(q1)}%;width:${pos(q9) - pos(q1)}%"></span>` : ''}${finite(f[m.key]) ? `<span class="indicator-marker" style="left:${pos(f[m.key]!)}%"></span>` : ''}${finite(target[m.key]) ? `<span class="indicator-target" style="left:${pos(target[m.key]!)}%"></span>` : ''}</span>`;
			b.onclick = () =>
				openHelp(m, [
					['自分', `${fmt(f[m.key], m.n)} ${m.unit}`],
					['選んだ見本', `${fmt(target[m.key], m.n)} ${m.unit}`],
					[referenceGroupLabel() + 'の見本 · 中央80%', `${fmt(q1, m.n)}–${fmt(q9, m.n)} ${m.unit}`],
					['参照話者数', values.length]
				]);
			$('indicators').append(b);
		}
		if (focused)
			$('indicators')
				.querySelector<HTMLElement>(`[data-metric="${focused}"]`)
				?.focus({ preventScroll: true });
		drawProfile(f, target);
		updateVerdict();
		const comparison = map.space?.comparison(f, target, map.dimension, map.projection);
		$('fit-value').textContent = comparison ? fmt(comparison.distance, 2) : '—';
		$('report-button').title = comparison
			? '見本との5指標の標準化距離。0が一致。比較レポートを開く。'
			: '比較レポートを開く';
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
		const pitchRefs = referenceStats().map((c) => c.features.f0 as number);
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
			f = activeFeatures('own');
		const key = (c: Clip) =>
			sort === 'near'
				? map.space!.distance(c.features, f)
				: sort === 'low'
					? (c.features.f0 ?? Infinity)
					: sort === 'high'
						? -(c.features.f0 ?? -Infinity)
						: 0;
		return clips.sort((a, b) =>
			sort === 'name'
				? speakerName(a).localeCompare(speakerName(b), state.lang === 'lab' ? 'en' : state.lang, {
						numeric: true
					}) || a.id.localeCompare(b.id)
				: key(a) - key(b) || a.id.localeCompare(b.id)
		);
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
		b.innerHTML = `<span class="sample-symbol"><svg aria-hidden="true"><use href="#i-play"></use></svg></span><div><span class="sample-title"><b>${esc(clip.text || nameOf(clip))}</b></span><span class="sample-phrase">${fmt(clip.features.f0)} Hz · ${clock(clip.duration)}${clip.synthetic ? ' · AI' : ''}</span></div>`;
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
			`${clip.text || nameOf(clip)} ${favorites.has(clip.id) ? 'をお気に入りから外す' : 'をお気に入りに追加'}`
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
			heading.innerHTML = `<svg class="folder-chevron" aria-hidden="true"><use href="#i-chevron"></use></svg><strong>${esc(speakerName(items[0]))}</strong>${items[0].synthetic ? '<small class="ai-badge">AI</small>' : ''}<span class="speaker-count">${items.length}</span>${favs ? '<span class="speaker-star" aria-label="お気に入りあり">★</span>' : ''}`;
			const list = document.createElement('div');
			list.className = 'speaker-clips';
			const populate = () => {
				list.replaceChildren();
				const limit = speakerLimits.get(key) || 30;
				for (const c of items.slice(0, limit)) list.append(clipRow(c));
				if (items.length > limit) {
					const more = document.createElement('button');
					more.className = 'speaker-more';
					more.textContent = 'もっと見る';
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
	for (const id of ['sort', 'teacher', 'teacher-pitch', 'teacher-resonance', 'teacher-weight'])
		$(id).onchange = () => renderLibrary(true);
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
	async function changeLanguage(lang: string, push = true) {
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
			if (push) history.pushState({}, '', `/${lang}/`);
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
			updateJvsBanner();
			state.scorer = new Scorer(lib.clips);
			state.representatives = representatives(state.clips);
			map.space = new AcousticSpace(
				state.representatives.length ? state.representatives : state.clips.filter((c) => c.plotted)
			);
			map.trackCache = new WeakMap();
			map.reset();
			buildFit();
			syncProjection();
			$('corpus-count').textContent =
				`${state.clips.filter((c) => !c.synthetic).length.toLocaleString()}音声 · ${new Set(state.clips.filter((c) => !c.synthetic).map((c) => c.speaker)).size.toLocaleString()}人`;
			$<HTMLSelectElement>('library-group').value = lang === 'lab' ? 'all' : 'female';
			$<HTMLSelectElement>('sort').value = lang === 'lab' ? 'name' : 'high';
			state.loadingLanguage = false;
			renderLibrary(true);
			updateIndicators();
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
	$('language').onchange = (e) =>
		changeLanguage((e.target as HTMLSelectElement).value).catch((e) => notify(e.message, true));
	window.addEventListener('popstate', () =>
		changeLanguage(location.pathname.split('/')[1] || 'ja', false).catch((e) =>
			notify(e.message, true)
		)
	);
	async function selectSample(clip: Clip | undefined, play = false) {
		if (!clip || state.recording || state.loadingLanguage) return;
		cancelAB();
		reference.pause();
		const previousGroup = referenceGroup();
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
		if (previousGroup !== referenceGroup()) buildFit();
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
			`${fmt(clip.features.f0)} Hz · ${fmt(clip.features.delta_f)} ΔF${clip.synthetic ? ' · 合成音声' : ''}`;
		$('selected-text').textContent = clip.text!;
		$('selected-text').lang = state.lang;
		$('source-link').hidden = !clip.source;
		if (clip.source) $<HTMLAnchorElement>('source-link').href = clip.source;
		$<HTMLButtonElement>('play-reference').disabled = false;
		renderLibrary();
		updateIndicators();
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
			updateIndicators();
			if (signal.source === 'ref') updateRangeLabel();
		} catch (e) {
			if (token === state.detailToken) notify('見本の解析：' + (e as Error).message, true);
		}
	}
	function controls() {
		const near = $('sort').querySelector<HTMLOptionElement>('option[value=near]')!;
		near.disabled = !AcousticSpace.raw(activeFeatures('own')).every(finite);
		if (near.disabled && $<HTMLSelectElement>('sort').value === 'near')
			$<HTMLSelectElement>('sort').value = 'name';
		const busy = state.busy || state.recording || state.loadingLanguage;
		for (const id of [
			'upload',
			'reference-upload',
			'add-reference',
			'language',
			'play-mine',
			'compare-ab',
			'reference-seek',
			'words-button',
			'range-reset'
		])
			$<HTMLButtonElement>(id).disabled = busy;
		$<HTMLButtonElement>('play-mine').disabled = busy || !state.ownFull;
		$<HTMLButtonElement>('play-reference').disabled = busy || !state.selected;
		$<HTMLButtonElement>('share-button').disabled = busy || !shareResult();
		$('share-button').title = state.scorer?.available
			? '判定を共有'
			: 'この言語の見本では判定を計算できません';
		$<HTMLButtonElement>('record').disabled =
			state.busy || state.loadingLanguage || (state.recording && state.captureMode === 'live');
		$('record').setAttribute(
			'aria-pressed',
			String(state.recording && state.captureMode === 'record')
		);
		$('record').setAttribute('aria-label', state.recording ? '録音を停止' : '新しく録音');
		icon($('record'), state.recording && state.captureMode === 'record' ? 'stop' : 'mic');
		$('record').title =
			state.recording && state.captureMode === 'record' ? '録音を停止（R）' : '録音（R）';
		$<HTMLButtonElement>('live-mode').disabled =
			state.busy || state.loadingLanguage || (state.recording && state.captureMode !== 'live');
		$('live-mode').setAttribute(
			'aria-checked',
			String(state.recording && state.captureMode === 'live')
		);
		const isLive = state.recording && state.captureMode === 'live';
		$('live-mode').setAttribute(
			'aria-label',
			isLive ? 'リアルタイム測定を停止' : 'リアルタイム測定を開始'
		);
		$('live-mode').title = isLive
			? 'リアルタイム測定を停止（Esc）'
			: 'マイクの声をリアルタイムに表示';
		$('live-mode-label').textContent = isLive ? '測定中' : 'リアルタイム';
		$('live-time').hidden = !isLive;
		$<HTMLButtonElement>('loopback').disabled = !state.recording || state.busy;
		renderTakeMenu();
		$('state').textContent = state.recording
			? state.captureMode === 'live'
				? '測定中'
				: '録音中'
			: state.busy
				? '準備中'
				: state.analyzing.has(state.ownTakeId!)
					? '解析中'
					: '';
		$('state').hidden = !$('state').textContent;
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
			const m = side === 'own' ? state.ownFull : state.refFull || state.selected;
			const level = m?.level_dbfs,
				peak = m?.peak;
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
	async function playSide(side: Side, fromStart = false) {
		if (state.recording || state.busy || state.loadingLanguage) return;
		await audioReady();
		const el = side === 'own' ? player : reference,
			other = side === 'own' ? reference : player,
			r = state.ranges[side];
		other.pause();
		if (fromStart || (r && (el.currentTime < r[0] || el.currentTime >= r[1] - 0.02)) || el.ended)
			el.currentTime = r?.[0] || 0;
		await el.play();
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
			$(id).setAttribute('aria-label', side === 'own' ? '自分の声を一時停止' : '見本を一時停止');
			map.invalidate();
		});
		el.addEventListener('pause', () => {
			icon($(id), 'play');
			$(id).setAttribute('aria-label', side === 'own' ? '自分の声を再生' : '見本を再生');
			map.invalidate();
			signal.dirty = true;
		});
		el.addEventListener('error', () => {
			if (el.src) notify('再生できませんでした。別の音声を選んでください。', true);
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
			if (!finite(seconds) || seconds <= 0)
				throw new Error('両方の音声が読み込まれるまでお待ちください。');
			$('compare-ab').setAttribute('aria-pressed', 'true');
			await playSide('ref', true);
			let phase = 'ref';
			abTimer = setInterval(() => {
				if (phase === 'ref' && (reference.paused || reference.currentTime - refStart >= seconds)) {
					reference.pause();
					phase = 'starting';
					playSide('own', true)
						.then(() => (phase = 'own'))
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
		$('space-label').title =
			map.projection === 'contrast'
				? '5つの指標から計算。横軸は女性的な声と男性的な声が最も離れる方向です。'
				: '5つの指標から計算した主成分空間';
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
		$('signal-both').title = signal.overlay
			? '各範囲の長さを0〜100%にそろえます。単語の位置は一致しません。'
			: '長さをそろえて重ねて表示します';
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
		if (!range) {
			if (side === 'own') state.own = full;
			else state.ref = full;
			updateMap();
			updateIndicators();
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
			updateIndicators();
		} catch (e) {
			if (token === state.rangeToken[side]) notify((e as Error).message, true);
		}
	}
	$('range-reset').onclick = () => selectRange(signal.source, null);
	function setLiveShapeWindow(value: unknown) {
		map.liveShapeSeconds = clamp(Math.round(Number(value) || 5), 1, 30);
		$<HTMLInputElement>('live-shape-window').value = String(map.liveShapeSeconds);
		$('live-shape-duration').textContent = map.liveShapeSeconds + ' 秒';
		$('live-shape-window').setAttribute('aria-valuetext', map.liveShapeSeconds + ' 秒');
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
			b.title = `${w.start.toFixed(2)}–${w.end.toFixed(2)}s · 推定位置`;
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
				if (!pcm) throw new Error('先に音声を読み込んでください。');
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
			$('words-button').textContent = '単語';
		}
	};
	async function decode(blob: Blob): Promise<PCM> {
		if (blob.size > 150 * 1024 * 1024) throw new Error('150 MB未満の音声を選んでください。');
		const ctx = new AudioContext();
		try {
			const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
			if (decoded.duration > 900 || decoded.duration < 0.25)
				throw new Error('0.25秒〜15分の音声を選んでください。');
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
						'声を検出できませんでした。マイクの入力を確認してください。',
					'Speak for a little longer.': 'もう少し長く話してください。',
					'Unstable resonance estimate.': '響きを安定して測定できませんでした。'
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
		updateIndicators();
		updateMap();
		renderWords();
		updateRangeLabel();
		const bad =
			qualityMessage(detail.reason) ||
			((detail.resonance_sensitivity_pct || 0) > 12
				? '響きの推定値が解析設定によって変わりやすい音声です。'
				: '');
		$('quality-state').textContent = bad;
		$('quality-state').hidden = !bad;
		controls();
		if (remember && !recordSnapshot) void persistTakes();
	}
	async function importAudio(file: File | undefined, side: Side) {
		if (!file || state.busy || state.recording) return;
		cancelAB();
		player.pause();
		reference.pause();
		state.busy = true;
		controls();
		try {
			const pcm = await decode(file);
			if (pcm.length / 16000 > (state.capabilities?.maxSeconds || 900))
				throw new Error(
					`${(state.capabilities?.maxSeconds || 900) / 60}分以内の音声を選んでください。`
				);
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
				state.custom.push(c);
				$<HTMLSelectElement>('library-group').value = 'custom';
				await selectSample(c, false);
			}
			notify('音声を読み込みました。');
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
				m = await engine.live(pcm, (liveController = new AbortController()).signal);
			if (generation !== liveGeneration || !state.recording) return;
			const rows = m.track!.map((p) => ({ ...p, t: p.t + offset }));
			const replaceAt = Math.max(offset + 0.12, end - window + 0.12);
			state.liveTrack = state.liveTrack
				.filter((p) => p.t < replaceAt && (state.captureMode !== 'live' || p.t > end - 90))
				.concat(rows.filter((p) => p.t >= replaceAt));
			state.ownFull = { ...m, track: state.liveTrack, duration: end };
			state.own = m;
			state.ranges.own = null;
			state.liveClock = {
				end: rows.at(-1)?.t || end,
				at: performance.now(),
				start: Math.max(0, end - 0.65)
			};
			signal.data.own = m;
			signal.ranges.own = [0, m.duration];
			signal.focus.own = null;
			signal.live = true;
			signal.dirty = true;
			map.own = state.ownFull;
			map.ownFeatures = m.features;
			map.ownRange = null;
			map.invalidate();
			$('quality-state').textContent = m.active ? '' : '音声を待っています…';
			$('quality-state').hidden = !!m.active;
			updateIndicators();
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
				(e as Error).name === 'NotAllowedError'
					? 'ブラウザーのマイク設定で、このページからの使用を許可してください。'
					: (e as Error).message,
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
		$('loopback').setAttribute('aria-label', '自分の声を聴く');
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
		updateIndicators();
		renderWords();
		updateRangeLabel();
		controls();
	}
	function persistTakes() {
		const current = state.recording ? recordSnapshot : snapshotOwn();
		if (!current) return Promise.resolve();
		return TakeStore.write({ current, previous: state.previousTake || null }).catch(() =>
			notify('録音を保存できませんでした。必要な音声をダウンロードしてください。', true)
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
			if (pcm.length < 4000) throw new Error('0.25秒以上録音してください。');
			setOwn(pendingAnalysis(pcm), `録音 ${state.takes.length + 1}`, null, pcm);
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
		$('loopback').setAttribute('aria-label', enabled ? '自分の声の再生を止める' : '自分の声を聴く');
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
			t: Take = {
				id,
				name: state.ownName,
				date: old?.date || new Date().toISOString(),
				features: state.ownFull!.features,
				duration: state.ownFull!.duration,
				language: state.ownLanguage,
				stored: true,
				...(quality && { quality })
			};
		const saved = await TakeStore.saveRecording(snapshot, t);
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
			state.previousTake = complete(state.previousTake);
			recordSnapshot = complete(recordSnapshot) ?? null;
			if (!state.recording && state.ownTakeId === id) {
				state.ownFull = detail;
				if (!state.ranges.own) state.own = detail;
				signal.set('own', detail);
				signal.setRange('own', state.ranges.own, state.ranges.own ? state.own : null);
				updateIndicators();
				updateRangeLabel();
				const warning = qualityMessage(detail.reason) || '';
				$('quality-state').textContent = warning;
				$('quality-state').hidden = !warning;
			}
			updateMap();
			await persistTakes();
		} catch {
			if (state.takes.some((t) => t.id === id))
				notify('録音を残しました。録音のメニューから再解析できます。', true);
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
				notify(
					'録音を保存できませんでした。音声をダウンロードしてから、保存容量を確認してください。',
					true
				);
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
			refs = referenceStats();
		const rows = METRICS.map((m) => {
			const vals = refs.map((c) => c.features[m.key]).filter(finite);
			return `<tr><td>${m.label} · ${m.unit}</td><td>${fmt(f[m.key], m.n)}</td><td>${fmt(r[m.key], m.n)}</td><td>${fmt(quantile(vals, 0.1), m.n)}〜${fmt(quantile(vals, 0.9), m.n)}</td></tr>`;
		});
		for (const [key, label] of [
			['pitch_sd_hz', '高さの標準偏差 · Hz'],
			['pitch_sd_st', '高さの標準偏差 · 半音'],
			['quiet_pct', '無音の割合 · %'],
			['quiet_mean', '無音区間の平均 · 秒'],
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
				`<tr><td>話す速さ · ${esc(state.words.own.pace_unit)}</td><td>${fmt(state.words.own.pace, 1)}</td><td>${state.words.ref?.pace_unit === state.words.own.pace_unit ? fmt(state.words.ref!.pace, 1) : '—'}</td><td>—</td></tr>`
			);
		const notes: string[] = [];
		if (finite(f.f0) && finite(r.f0)) {
			const diff = 12 * Math.log2(r.f0 / f.f0);
			notes.push(
				`見本の高さは自分より${fmt(Math.abs(diff), 1)}半音${diff >= 0 ? '高め' : '低め'}です。速度を落として聴き、無理のない高さで同じ文を試してください。`
			);
		}
		if (finite(f.delta_f) && finite(r.delta_f))
			notes.push(
				`響きの推定値は自分 ${fmt(f.delta_f)}、見本 ${fmt(r.delta_f)} Hz ΔF。同じ母音や短い言葉を選び、高さを保ちながら響きの違いを聴き比べてください。`
			);
		notes.push(
			'抑揚は言語や文の内容でも変わります。同じ文章を読み、アクセント、文末、間の取り方を比べてください。'
		);
		return `<div class="report-score">${comparison ? fmt(comparison.distance, 2) : '—'}</div><p>見本との音響的な差 · 0で一致</p><p class="small">高さ・響き・質感・明るさ・抑揚の5指標を標準化した距離です。女性らしさや自然さの評価には対応していません。</p>${comparison ? `<p>この2音声の差：図に表示 ${Math.round(comparison.displayedShare * 100)}% · 省略 ${Math.round((1 - comparison.displayedShare) * 100)}%</p><p class="small">5次元での差の二乗を分けた割合です。図で重なっていても、省略された方向では離れていることがあります。</p>` : ''}<table class="report-table"><thead><tr><th>指標</th><th>自分</th><th>見本</th><th>参照音声の中央80%</th></tr></thead><tbody>${rows.join('')}</tbody></table><ul class="report-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p class="small">${esc(state.ownName)} · ${clock(state.ownFull?.duration)} · 見本 ${esc(nameOf((state.selected || {}) as Clip))}<br>録音言語 ${esc(state.ownLanguage)} · 見本の言語 ${esc(state.lang)}${fit === null ? '' : `<br>${referenceGroupLabel()}の参照分布内の密度順位：${Math.round(fit)}パーセンタイル（聞き手による評価ではありません）。`}<br>分布図は5次元を${map.dimension}次元に投影しています。表示する分散は${Math.round((map.space?.explained(map.dimension, map.projection) || 0) * 100)}%。省略された方向の違いは左の指標で確認できます。</p>`;
	}
	$('report-button').onclick = () => {
		$('report-content').innerHTML = reportHTML();
		$<HTMLDialogElement>('report-dialog').showModal();
	};
	$('report-save').onclick = () => {
		const html = `<!doctype html><meta charset="utf-8"><title>声の比較</title><style>body{font:15px system-ui;max-width:850px;margin:40px auto;padding:0 20px;color:#30364c}.report-score{font-size:40px;color:#b44e80}table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:right;border-bottom:1px solid #ddd}td:first-child,th:first-child{text-align:left}.small{font-size:12px;color:#555;line-height:1.7}li{margin:14px 0;line-height:1.7}</style>${reportHTML()}<p><a href="https://www.isca-archive.org/interspeech_2025/netzorg25_interspeech.html">測定方法の研究</a> · ${new Date().toLocaleDateString()}</p>`;
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
		if (profileTheme !== document.documentElement.dataset.theme) {
			profileTheme = document.documentElement.dataset.theme!;
			drawProfile(activeFeatures('own'), activeFeatures('ref'));
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
			languages: { id: string; label: string }[];
		}>('/api/catalog');
		state.capabilities = catalog.capabilities || {};
		$('words-button').hidden = state.capabilities.words === false;
		$('language').replaceChildren(...catalog.languages.map((l) => new Option(l.label, l.id)));
		const view = readView();
		setLiveShapeWindow(view?.liveShapeSeconds);
		const requested = location.pathname.split('/')[1] || view?.lang || 'ja',
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
		await changeLanguage(lang, false);
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
			changeLanguage,
			controls,
			TakeStore,
			snapshotOwn,
			captureDebug: () => ({
				bufferSeconds: chunks.reduce((n, c) => n + c.length, 0) / (recordContext?.sampleRate || 1),
				monitoring: !!monitorGain && monitorGain.gain.value > 0,
				hasSnapshot: recordSnapshot !== null
			})
		};
		localize();
	}
	/* web/locale.js: the page language and the research library's label. */
	function localize() {
		document.documentElement.lang = 'ja';
		const lab = document.querySelector('#language option[value="lab"]');
		if (lab) lab.textContent = '発声の見本';
	}

	let profileTheme = '';
	function drawProfile(own: Features, ref: Features) {
		const canvas = $<HTMLCanvasElement>('profile-canvas');
		if (!canvas) return;
		const w = canvas.clientWidth,
			h = canvas.clientHeight;
		if (!w || !h) return;
		const dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		const c = canvas.getContext('2d')!;
		c.scale(dpr, dpr);
		const css = getComputedStyle(document.documentElement),
			color = (k: string) => css.getPropertyValue(k).trim();
		const cx = w / 2,
			cy = h / 2 + 3,
			r = Math.min(w / 2 - 28, h / 2 - 23);
		const refs = state.representatives,
			limits = METRICS.map((m) => {
				const values = refs.map((p) => p.features[m.key]).filter(finite);
				return [quantile(values, 0.01), quantile(values, 0.99)];
			});
		const point = (i: number, ratio: number): [number, number] => [
			cx + Math.sin((i * Math.PI * 2) / 5) * r * ratio,
			cy - Math.cos((i * Math.PI * 2) / 5) * r * ratio
		];
		c.strokeStyle = color('--line');
		c.lineWidth = 1;
		for (const scale of [0.33, 0.66, 1]) {
			c.beginPath();
			for (let i = 0; i < 5; i++) {
				const p = point(i, scale);
				if (i) c.lineTo(...p);
				else c.moveTo(...p);
			}
			c.closePath();
			c.stroke();
		}
		c.font = '10px system-ui';
		c.textAlign = 'center';
		c.fillStyle = color('--muted');
		for (let i = 0; i < 5; i++) {
			const p = point(i, 1),
				label = point(i, 1.27);
			c.beginPath();
			c.moveTo(cx, cy);
			c.lineTo(...p);
			c.stroke();
			c.fillText(METRICS[i].label, label[0], label[1] + 3);
		}
		for (const [f, key, dash] of [
			[ref, '--reference', []],
			[own, '--self', [4, 3]]
		] as [Features, string, number[]][]) {
			if (!METRICS.every((m) => finite(f[m.key]))) continue;
			const pts = METRICS.map((m, i) =>
				point(
					i,
					0.12 + 0.88 * clamp((f[m.key]! - limits[i][0]) / (limits[i][1] - limits[i][0] || 1), 0, 1)
				)
			);
			c.beginPath();
			pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
			c.closePath();
			c.strokeStyle = color(key);
			c.lineWidth = 2;
			c.setLineDash(dash);
			c.stroke();
			c.setLineDash([]);
			c.fillStyle = color(key);
			c.globalAlpha = 0.06;
			c.fill();
			c.globalAlpha = 1;
			for (const p of pts) {
				c.beginPath();
				c.arc(...p, 2.5, 0, Math.PI * 2);
				c.fill();
			}
		}
	}
	new ResizeObserver(() => drawProfile(activeFeatures('own'), activeFeatures('ref'))).observe(
		$('profile-canvas')
	);

	function updateFavorite() {
		const yes = favorites.has(state.selected?.id ?? '');
		$('favorite-selected').textContent = yes ? '★' : '☆';
		$('favorite-selected').setAttribute('aria-pressed', String(yes));
		$('favorite-selected').setAttribute(
			'aria-label',
			yes ? 'お気に入りから外す' : 'お気に入りに追加'
		);
	}
	function toggleFavorite(id: string | undefined) {
		if (!id) return;
		if (favorites.has(id)) favorites.delete(id);
		else favorites.add(id);
		try {
			localStorage.setItem('voice-favorites', JSON.stringify([...favorites]));
		} catch {
			notify('お気に入りを保存できませんでした。', true);
		}
		TakeStore.write(
			state.custom.filter((c) => favorites.has(c.id)).map(({ audio: _audio, ...c }) => c),
			'references'
		).catch(() => notify('見本の音声を保存できませんでした。', true));
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
		updateIndicators();
		renderWords();
		controls();
	}

	let takeChoices: (Snapshot | Take)[] = [];
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
		select.replaceChildren();
		takeChoices.forEach((t, i) => {
			const option = new Option(t.name, String(i));
			option.dataset.detail = clock((t as Snapshot).detail?.duration || (t as Take).duration);
			option.dataset.actions = 'download,delete';
			if (state.recording || !((t as Snapshot).takeId || t.storedId))
				option.dataset.disabledActions = 'delete';
			select.add(option);
		});
		if (current?.detail?.analysisPending && !state.analyzing.has(current.takeId!))
			select.add(new Option('再解析', 'retry'));
		select.disabled = state.busy || !takeChoices.length;
		select.value = current?.pcm ? '0' : '';
		select.setAttribute('data-display-label', current?.name || '録音履歴');
	}
	async function restoreTake(chosen: Snapshot | Take | { storedId: string }) {
		if (state.busy) return;
		if ((chosen as Take).storedId)
			chosen = (await TakeStore.read<Snapshot>('recording:' + (chosen as Take).storedId))!;
		if (!(chosen as Snapshot)?.pcm) throw new Error('この録音は読み込めませんでした。');
		const current = state.recording ? recordSnapshot : snapshotOwn();
		if (state.recording) await cancelCapture();
		cancelAB();
		player.pause();
		reference.pause();
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
			await TakeStore.write({ current: snapshotOwn(), previous: state.previousTake || null });
			updateMap();
			saveView();
			notify('録音を削除しました。');
		} catch {
			notify('録音を削除できませんでした。もう一度お試しください。', true);
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
		if (!chosen) return;
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
		if (detail.action === 'download')
			try {
				if (chosen.storedId)
					chosen = (await TakeStore.read<Snapshot>('recording:' + chosen.storedId))!;
				if (!chosen?.pcm) throw new Error('この録音は読み込めませんでした。');
				download(wav(chosen.pcm), chosen.name.replace(/\.[^.]+$/, '') + '.wav');
			} catch (error) {
				notify((error as Error).message, true);
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
			if (!takes.length) throw new Error('保存された録音がありません。');
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
			notify(`${takes.length}件の録音をまとめました。`);
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
			notify('保存された録音がありません。');
			return;
		}
		if (!confirm(`保存された録音${stored.length}件をすべて削除します。元に戻せません。`)) return;
		for (const t of stored) await deleteTake({ storedId: t.id });
		notify(`${stored.length}件の録音を削除しました。`);
	};

	function updateJvsBanner() {
		const count = new Set(state.clips.filter((c) => c.dataset === 'JVS').map((c) => c.id)).size;
		$('jvs-banner').hidden = state.lang !== 'ja' || count >= 5000;
	}
	let importController: AbortController | null = null;
	$('add-reference').onclick = () => {
		$('jvs-status').textContent = state.imported.length
			? `${state.imported.length.toLocaleString()}音声を追加済み`
			: '';
		$<HTMLDialogElement>('import-dialog').showModal();
	};
	$('jvs-banner-import').onclick = () => {
		$('add-reference').click();
		$('choose-jvs-zip').focus();
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
					$('jvs-status').textContent = `${done.toLocaleString()} / ${total.toLocaleString()}`;
				},
				controller.signal
			);
			$('jvs-status').textContent = `${result.total.toLocaleString()}音声を追加済み`;
		} catch (e) {
			$('jvs-status').textContent =
				(e as Error).name === 'AbortError'
					? '中止しました。読み込み済みの音声は保存されています。'
					: (e as Error).message;
		} finally {
			importController = null;
			state.busy = false;
			state.imported = await loadImported<Clip & ImportClip>().catch(() => state.imported);
			if (state.lang === 'ja') await changeLanguage('ja', false);
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
					liveShapeSeconds: map.liveShapeSeconds
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
	/* The share dialog scores whatever the indicators show: the whole recording, or the selected range. */
	function activeMeasurement() {
		return state.own || state.ownFull;
	}
	function shareResult(): ScoreResult | null {
		const m = activeMeasurement();
		return state.scorer?.available && m && !m.analysisPending && !gateFailure(m)
			? state.scorer.score(m.features || {})
			: null;
	}
	const scalePos = (s: number) => `${clamp((s + 60) / 120, 0, 1) * 100}%`;
	function updateVerdict() {
		const result = shareResult(),
			scorer = state.scorer;
		const readout = $<HTMLButtonElement>('verdict-readout');
		readout.disabled = !result;
		$('verdict-main').dataset.verdict = result?.verdict || '';
		const m = activeMeasurement(),
			gate = m && !m.analysisPending && scorer?.available ? gateFailure(m) : null;
		$('verdict-word').textContent = result
			? VERDICTS[result.verdict]
			: !scorer?.available
				? 'この言語では計算できません'
				: !m
					? '録音すると表示'
					: m.analysisPending
						? '解析中'
						: 'まだ判定できません';
		$('verdict-number').textContent = result ? formatScore(result.display) : '';
		$('verdict-gate').hidden = !gate || !!result;
		if (gate && !result)
			$('verdict-gate').textContent = gate.value
				? `${gate.label} ${gate.value}（${gate.need}）`
				: gate.label;
		for (const g of ['male', 'female'] as const) {
			const band = scorer?.available ? scorer.bands[g] : null,
				el = $('verdict-band-' + g);
			el.hidden = !band;
			if (band) {
				el.style.left = scalePos(band[0]);
				el.style.width = `calc(${scalePos(band[1])} - ${scalePos(band[0])})`;
			}
		}
		if (result) $('verdict-dot').style.left = scalePos(result.score);
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
			y = (s: number) => T + (H - T - B) * (1 - (clamp(s, -50, 50) + 50) / 100),
			x = (i: number) => L + (W - L - R) * (rows.length > 1 ? i / (rows.length - 1) : 0.5);
		const band = (g: 'male' | 'female', color: string) =>
			`<rect x="${L}" y="${y(bands[g][1])}" width="${W - L - R}" height="${Math.max(1, y(bands[g][0]) - y(bands[g][1]))}" fill="${color}" opacity=".18"/>`;
		const points = rows.map((r, i) => [x(i), y(r.result.score)]);
		const day = (d: string) =>
			new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
		$('history-chart').innerHTML =
			`${band('male', 'var(--sky)')}${band('female', 'var(--pink)')}<line x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3"/>${[50, 0, -50].map((v) => `<text x="${L - 6}" y="${y(v) + 3}" font-size="8" text-anchor="end" fill="var(--muted)">${formatScore(v)}</text>`).join('')}<polyline points="${points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--self)" stroke-width="1.5"/>${points.map(([px, py], i) => `<circle cx="${px}" cy="${py}" r="${rows[i].take.id === state.ownTakeId ? 4 : 2.5}" fill="var(--self)" stroke="var(--surface)" stroke-width="1"/>`).join('')}<text x="${L}" y="${H - 4}" font-size="8" fill="var(--muted)">${day(rows[0].take.date)}</text><text x="${W - R}" y="${H - 4}" font-size="8" text-anchor="end" fill="var(--muted)">${day(rows.at(-1)!.take.date)}</text>`;
		$('history-list').replaceChildren(
			...[...rows].reverse().map((r) => {
				const li = document.createElement('li');
				li.setAttribute('aria-current', String(r.take.id === state.ownTakeId));
				const when = new Date(r.take.date);
				li.innerHTML = `<span class="history-name">${esc(r.take.name)}</span><time datetime="${esc(r.take.date)}">${when.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${when.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</time><span class="history-verdict" data-verdict="${r.result.verdict}">${VERDICTS[r.result.verdict]}</span><b>${formatScore(r.result.display)}</b>`;
				const b = document.createElement('button');
				if (r.take.id === state.ownTakeId) {
					b.textContent = '表示中';
					b.disabled = true;
				} else {
					b.textContent = '開く';
					b.title = 'この録音を表示';
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
	$('verdict-readout').onclick = () => $('share-button').click();
	$('verdict-help').onclick = () => {
		const s = state.scorer;
		openHelp(
			VERDICT_HELP,
			s?.available
				? [
						[
							'男性的な見本 · 中央80%',
							`${formatScore(Math.round(s.bands.male[0]))}〜${formatScore(Math.round(s.bands.male[1]))}`
						],
						[
							'女性的な見本 · 中央80%',
							`${formatScore(Math.round(s.bands.female[0]))}〜${formatScore(Math.round(s.bands.female[1]))}`
						],
						['参照話者数', s.speakers.length]
					]
				: []
		);
	};
	$('share-button').onclick = async () => {
		const result = shareResult();
		if (!result) return;
		const scorer = state.scorer!,
			lang = state.lang === 'lab' ? 'en' : state.lang,
			bundle = shareBundle(result, scorer, lang);
		$('share-verdict').textContent = VERDICTS[result.verdict];
		$('share-verdict').dataset.verdict = result.verdict;
		$('share-score').querySelector('strong')!.textContent = formatScore(result.display);
		$('share-score').querySelector('span')!.textContent = LEANINGS[result.verdict];
		$('share-intents').replaceChildren(
			...bundle.intents.map((i) => {
				const a = document.createElement('a');
				a.href = i.href;
				a.target = '_blank';
				a.rel = 'noopener noreferrer';
				a.innerHTML = labelled(i.icon, i.label);
				a.title = `${i.label}に投稿`;
				return a;
			})
		);
		$<HTMLAnchorElement>('share-open').href = bundle.url;
		$('share-open').innerHTML = labelled('external', '結果ページ');
		$('share-system').innerHTML = labelled('share', '共有…');
		$('share-copy').innerHTML = labelled('link', 'リンクをコピー');
		$('share-save').innerHTML = labelled('image', '画像を保存');
		$('share-status').textContent = '';
		$('share-image').hidden = true;
		$('share-copy').onclick = async () => {
			try {
				await navigator.clipboard.writeText(bundle.url);
				$('share-status').textContent = 'リンクをコピーしました。';
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
			img.alt = `${bundle.text}。5つの指標と見本の分布を描いた画像。`;
			img.hidden = false;
		} catch (e) {
			$('share-status').textContent = (e as Error).message;
		}
	};
	init().catch((e) => notify('読み込めませんでした: ' + e.message, true));
}
