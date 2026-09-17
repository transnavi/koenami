/* The shared-result page: recomputes the verdict from the five measurements in the URL
   against the language's public library (ported from web/result.js). */
import { finite } from './math';
import { Scorer, parseResultParams, shareText, formatScore, ageText, METRIC_KEYS, METRIC_LABELS, METRIC_UNITS, METRIC_DIGITS, VERDICTS, LEANINGS, type Clip } from './score';
import { cardImage, intents, resultURL, systemShare, labelled } from './share';
import { LANGUAGES as languages } from './languages';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (v: unknown, n = 0) => (finite(v) ? v.toFixed(n) : '—');
const LANGUAGES = new Set<string>(languages);
function fail(message: string) {
	$('result-verdict').textContent = 'この結果は表示できません';
	$('result-status').textContent = message;
}
async function main() {
	const parsed = parseResultParams(new URLSearchParams(location.search));
	if (!parsed || !LANGUAGES.has(parsed.lang)) {
		fail('リンクに測定値が含まれていません。');
		return;
	}
	const library = await (await fetch(`/api/library?lang=${encodeURIComponent(parsed.lang)}`)).json().catch(() => null);
	if (!library) {
		fail('見本の一覧を読み込めませんでした。');
		return;
	}
	const scorer = new Scorer(library.clips as Clip[]),
		scored = scorer.score(parsed.features),
		result = scored && { ...scored, age: parsed.age };
	if (!result) {
		fail('この言語の見本では判定を計算できません。');
		return;
	}
	const url = resultURL(result.features, parsed.lang, location.origin, { age: result.age }),
		text = shareText(result);
	if (finite(result.age)) { $('result-age').querySelector('strong')!.textContent = ageText(result.age!); $('result-age').hidden = false; }
	document.title = `Koenami · ${VERDICTS[result.verdict]}（${LEANINGS[result.verdict]} ${formatScore(result.display)}）`;
	$('result-verdict').textContent = VERDICTS[result.verdict];
	$('result-verdict').dataset.verdict = result.verdict;
	$('result-score').querySelector('strong')!.textContent = formatScore(result.display);
	$('result-score').querySelector('span')!.textContent = LEANINGS[result.verdict];
	$('result-score').hidden = false;
	$('result-version').textContent = `v${result.version}`;
	if (parsed.version !== result.version) $('result-status').textContent = `このリンクは判定方式v${parsed.version}で作られました。現在の方式（v${result.version}）で計算し直しています。`;
	$<HTMLAnchorElement>('result-try').href = `/${parsed.lang}/`;
	$('result-metric-rows').innerHTML = METRIC_KEYS.map((key) => {
		const bands = scorer.metricBands[key],
			n = METRIC_DIGITS[key],
			range = (b: [number, number]) => `${fmt(b[0], n)}〜${fmt(b[1], n)}`;
		return `<tr><td>${METRIC_LABELS[key]} · ${METRIC_UNITS[key]}</td><td>${fmt(result.features[key], n)}</td><td>${range(bands.female)}</td><td>${range(bands.male)}</td></tr>`;
	}).join('');
	$('result-metrics').hidden = false;
	$('result-notes').hidden = false;
	$('result-intents').replaceChildren(
		...intents(url, text).map((i) => {
			const a = document.createElement('a');
			a.href = i.href;
			a.target = '_blank';
			a.rel = 'noopener noreferrer';
			a.innerHTML = labelled(i.icon, i.label);
			a.title = `${i.label}に投稿`;
			return a;
		})
	);
	$('result-copy').onclick = async () => {
		try {
			await navigator.clipboard.writeText(url);
			$('result-status').textContent = 'リンクをコピーしました。';
		} catch {
			$('result-status').textContent = url;
		}
	};
	let image: File | null = null;
	const render = async () => image || (image = await cardImage(result, scorer));
	$('result-save').onclick = async () => {
		try {
			const file = await render();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(file);
			a.download = file.name;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 1000);
		} catch (e) {
			$('result-status').textContent = (e as Error).message;
		}
	};
	// A system share sheet, where the browser offers one.
	if ((navigator as { share?: unknown }).share) {
		const b = document.createElement('button');
		b.type = 'button';
		b.innerHTML = labelled('share', '共有…');
		b.onclick = () =>
			systemShare(result, scorer, parsed.lang).catch((e) => {
				if (e.name !== 'AbortError') $('result-status').textContent = e.message;
			});
		$('result-copy').before(b);
	}
	$('result-copy').innerHTML = labelled('link', 'リンクをコピー');
	$('result-save').innerHTML = labelled('image', '画像を保存');
	$('result-actions').hidden = false;
	try {
		const file = await render();
		const img = $<HTMLImageElement>('result-image');
		img.src = URL.createObjectURL(file);
		img.alt = `${text}。5つの指標と見本の分布を描いた画像。`;
		img.hidden = false;
	} catch (e) {
		$('result-status').textContent = (e as Error).message;
	}
}
export function mountResult() {
	main().catch((e) => fail(e.message));
}
