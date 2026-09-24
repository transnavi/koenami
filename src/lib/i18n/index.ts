/* What the site knows about its languages beyond the messages: addresses, Open Graph locales,
   share-card fonts, the Worker's Accept-Language match, and the rendering of the page templates
   that are still HTML strings. The messages themselves are messages/<locale>.json, compiled by
   Paraglide into $lib/paraglide; the locale is the page's (see hooks.server.ts). Relative
   imports keep the module usable from worker.ts, which is bundled outside Vite. */
import { m } from '../paraglide/messages';
import { baseLocale, getLocale, locales, type Locale } from '../paraglide/runtime';

export { baseLocale, locales, type Locale };

export const OG_LOCALES: Record<Locale, string> = {
	ja: 'ja_JP',
	'zh-CN': 'zh_CN',
	en: 'en_US',
	ko: 'ko_KR'
};
/* The card font per language: the share font is a Noto Sans subset in three regional cuts. */
export const FONTS: Record<Locale, string> = {
	ja: 'Noto Sans JP',
	'zh-CN': 'Noto Sans SC',
	en: 'Noto Sans JP',
	ko: 'Noto Sans KR'
};
export const SITE = 'https://koe.transnavi.jp';
/* The share font ships in three cuts of Noto Sans; English uses the Japanese cut's Latin glyphs. */
export const fontCut = (locale: Locale) => (locale === 'ko' || locale === 'zh-CN' ? locale : 'ja');

/* The studio's address in a language; Japanese lives at the root. */
export const home = (locale: Locale = getLocale()) => (locale === baseLocale ? '/' : `/${locale}/`);
/* The practice guide: its Japanese page, or the English one on the English site. */
export const tutorialHref = (locale: Locale = getLocale()) =>
	locale === 'en' ? '/en/tutorial.html' : '/tutorial.html';
export const tutorialLang = (locale: Locale = getLocale()): Locale =>
	locale === 'en' ? 'en' : 'ja';

/* An Accept-Language value reduced to a served language: the ranges in quality order, a range
   of quality 0 excluded, each matched by exact tag and then by primary subtag (server.py's
   language() follows the same rule). The Worker answers API errors in it. */
export function matchLanguage(header: string | null | undefined): Locale {
	const ranges = (header || '')
		.split(',')
		.map((part, i) => {
			const [tag, ...params] = part
				.trim()
				.split(';')
				.map((p) => p.trim());
			const q = params.find((p) => p.startsWith('q='));
			return { tag: tag.toLowerCase(), q: q ? Number(q.slice(2)) : 1, i };
		})
		.filter((r) => r.tag && r.q > 0)
		.sort((a, b) => b.q - a.q || a.i - b.i);
	for (const { tag } of ranges) {
		const match =
			locales.find((l) => l.toLowerCase() === tag) ||
			locales.find((l) => l.split('-')[0] === tag.split('-')[0]);
		if (match) return match;
	}
	return baseLocale;
}

export type MessageId = keyof typeof m;
/* The ids that start a numbered list (`metric_f0_factors` for `metric_f0_factors_0`, `_1`, …). */
export type ListId = { [K in MessageId]: K extends `${infer P}_0` ? P : never }[MessageId];
type Message = (inputs?: Record<string, never>, options?: { locale?: Locale }) => string;
const table = m as unknown as Record<string, Message | undefined>;
/* A message by an id built at run time, from data (`gate_${key}`) or a template token; the type
   still admits only ids that exist. Code that names a message calls it on `m` directly. */
export function message<K extends MessageId>(id: K): (typeof m)[K] {
	const found = table[id];
	if (!found) throw new Error(`i18n: no message ${id}`);
	return found as unknown as (typeof m)[K];
}
/* A numbered list of messages, rendered in order. */
export function messages(list: ListId, locale: Locale = getLocale()): string[] {
	const out: string[] = [];
	for (let found; (found = table[`${list}_${out.length}`]);) out.push(found({}, { locale }));
	if (!out.length) throw new Error(`i18n: no message list ${list}`);
	return out;
}

const escapeHTML = (s: unknown) =>
	String(s).replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
	);
// Inside a <script> block a literal `<` must not start a tag, so it goes out as \u003c.
const escapeJSON = (s: unknown) => JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c');
/* Fills a page template in the page's language. Tokens: {{t:id}} (HTML-escaped text), {{h:id}}
   (markup from the messages), {{j:id}} (inside a JSON string), and the page fields {{lang}},
   {{og_locale}}, {{home}}, {{tutorial}}, {{tutorial_lang}}, {{url}}, {{links}} (canonical,
   hreflang alternates and the manifest). `path` is the page's address on the site, so every
   language names its own canonical while /ja/ points at the root it duplicates. */
export function renderPage(template: string, path: string, locale: Locale = getLocale()): string {
	const fields: Record<string, string> = {
		lang: locale,
		og_locale: OG_LOCALES[locale],
		home: home(locale),
		tutorial: tutorialHref(locale),
		tutorial_lang: tutorialLang(locale),
		url: SITE + path,
		links:
			path === '/r'
				? ''
				: [
						`<link rel="canonical" href="${SITE}${path}">`,
						...locales.map(
							(l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${home(l)}">`
						),
						`<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
						`<link rel="manifest" href="${home(locale)}site.webmanifest">`
					].join('')
	};
	const html = template.replace(
		/\{\{(?:(t|h|j):(\w+)|(\w+))\}\}/g,
		(_, kind: string | undefined, id: string | undefined, field: string | undefined) => {
			if (field) {
				if (!(field in fields)) throw new Error(`i18n: unknown page field ${field}`);
				return fields[field];
			}
			const value = (message(id as MessageId) as Message)({}, { locale });
			return kind === 'h' ? value : kind === 'j' ? escapeJSON(value) : escapeHTML(value);
		}
	);
	const stray = html.match(/\{\{[^}]*\}\}/);
	if (stray) throw new Error(`i18n: malformed page token ${stray[0]}`);
	return html;
}
/* The web app manifest in the page's language: the base with its texts and start page set. */
export function renderManifest(base: string, locale: Locale = getLocale()): string {
	const manifest = JSON.parse(base) as { screenshots?: { label?: string }[] } & Record<
		string,
		unknown
	>;
	manifest.name = m.manifest_name({}, { locale });
	manifest.description = m.manifest_description({}, { locale });
	manifest.lang = locale;
	manifest.start_url = home(locale);
	const labels = [
		m.manifest_screenshot_wide({}, { locale }),
		m.manifest_screenshot_narrow({}, { locale })
	];
	manifest.screenshots?.forEach((s, i) => {
		s.label = labels[i] ?? s.label;
	});
	return JSON.stringify(manifest, null, 2) + '\n';
}
