import { LANGUAGES, type Language } from '../languages';
import en from './en';
/* The interface languages: one catalogue per language, a translator over it, and the
   page rendering that writes /, /zh-CN/, /en/ and /ko/ as separate documents. This module
   runs in the browser, in the Worker and at build time, so it touches `document` only
   behind a guard. The arithmetic, the escaping and the field names are those of the
   studio's web/i18n/index.js, which the unit goldens pin. */
import ja, { type Catalogue, type Item, type Key } from './ja';
import ko from './ko';
import zh from './zh-CN';

export { LANGUAGES };
export type { Key, Language };
export const CATALOGUES: Record<Language, Catalogue> = { ja, 'zh-CN': zh, en, ko };
export const OG_LOCALES: Record<Language, string> = {
	ja: 'ja_JP',
	'zh-CN': 'zh_CN',
	en: 'en_US',
	ko: 'ko_KR'
};
/* The card font per language: the share font is a Noto Sans subset in three regional cuts. */
export const FONTS: Record<Language, string> = {
	ja: 'Noto Sans JP',
	'zh-CN': 'Noto Sans SC',
	en: 'Noto Sans JP',
	ko: 'Noto Sans KR'
};
export const SITE = 'https://koe.transnavi.jp';
/* The share font ships in three cuts of Noto Sans; English uses the Japanese cut's Latin glyphs. */
export const fontCut = (lang: string) => (lang === 'ko' || lang === 'zh-CN' ? lang : 'ja');

export const known = (lang: unknown): Language =>
	(LANGUAGES as readonly unknown[]).includes(lang) ? (lang as Language) : 'ja';
/* The studio's address in a language; Japanese lives at the root. */
export const home = (lang: string) => (lang === 'ja' ? '/' : `/${lang}/`);
/* An Accept-Language value, or any language tag, reduced to a served language: the ranges in
   quality order, each matched by exact tag and then by primary subtag (server.py's language()
   follows the same rule). */
export function matchLanguage(header: string | null | undefined): Language {
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
			LANGUAGES.find((l) => l.toLowerCase() === tag) ||
			LANGUAGES.find((l) => l.split('-')[0] === tag.split('-')[0]);
		if (match) return match;
	}
	return 'ja';
}
/* The language a request addresses: /<lang>/ pages, and ?l=<lang> on the result page. */
export function languageOf(url: string): Language {
	const { pathname, searchParams } = new URL(url, 'http://localhost');
	const segment = pathname.split('/')[1];
	if ((LANGUAGES as readonly string[]).includes(segment)) return segment as Language;
	return known(searchParams.get('l'));
}

export type Params = Record<string, string | number | undefined>;
export type Translator = {
	(key: Key, params?: Params): string;
	list(key: Key): Item[];
};
const rules = new Map<Language, Intl.PluralRules>();
export function translator(lang: unknown): Translator {
	const language = known(lang);
	const messages = CATALOGUES[language] as Record<string, unknown>;
	if (!rules.has(language)) rules.set(language, new Intl.PluralRules(language));
	const plural = rules.get(language)!;
	/* t(key, params): a string with {name} filled in (numbers in the language's digit
	   grouping). A {one, other} entry picks its form by params.n. A missing key is a
	   programming error. `list(key)` gives the array a list key holds. */
	const lookup = (key: Key): unknown => {
		let value = messages[key];
		if (value === undefined) value = (ja as Record<string, unknown>)[key];
		if (value === undefined) throw new Error(`i18n: no message for ${key}`);
		return value;
	};
	const t = ((key: Key, params?: Params): string => {
		let value = lookup(key);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const forms = value as Record<string, string>;
			value = forms[plural.select(Number(params?.n) || 0)] ?? forms.other;
		}
		if (Array.isArray(value)) return value.slice() as unknown as string;
		if (!params) return value as string;
		return (value as string).replace(/\{(\w+)\}/g, (m, name: string) =>
			!(name in params)
				? m
				: typeof params[name] === 'number'
					? params[name].toLocaleString(language)
					: String(params[name])
		);
	}) as Translator;
	t.list = (key: Key) => {
		const value = lookup(key);
		if (!Array.isArray(value)) throw new Error(`i18n: ${key} is not a list`);
		return value.slice() as Item[];
	};
	return t;
}

/* The browser's language is the document's; the Worker and the build pass one explicitly. */
export const lang: Language =
	typeof document === 'undefined' ? 'ja' : known(document.documentElement.lang);
export const t = translator(lang);

const escapeHTML = (s: unknown) =>
	String(s).replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!
	);
// Inside a <script> block a literal `<` must not start a tag, so it goes out as \u003c.
const escapeJSON = (s: unknown) => JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c');
/* Fills a page template for one language. Tokens: {{t:key}} (HTML-escaped text), {{h:key}}
   (markup from the catalogue), {{j:key}} (inside a JSON string), and the page fields
   {{lang}}, {{og_locale}}, {{home}}, {{url}}, {{links}} (canonical, hreflang alternates and
   the manifest). `path` is the page's address on the site, so every language names its own
   canonical while /ja/ points at the root it duplicates. */
export function renderPage(template: string, lang: unknown, path: string): string {
	const language = known(lang);
	const t = translator(language);
	const fields: Record<string, string> = {
		lang: language,
		og_locale: OG_LOCALES[language],
		home: home(language),
		url: SITE + path,
		links:
			path === '/r'
				? ''
				: [
						`<link rel="canonical" href="${SITE}${path}">`,
						...LANGUAGES.map(
							(l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${home(l)}">`
						),
						`<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
						`<link rel="manifest" href="${language === 'ja' ? '/site.webmanifest' : `/${language}/site.webmanifest`}">`
					].join('')
	};
	return template.replace(
		/\{\{(?:(t|h|j):([\w.-]+)|(\w+))\}\}/g,
		(m, kind: string | undefined, key: string | undefined, field: string | undefined) => {
			if (field) {
				if (!(field in fields)) throw new Error(`i18n: unknown page field ${field}`);
				return fields[field];
			}
			const value = t(key as Key);
			return kind === 'h' ? value : kind === 'j' ? escapeJSON(value) : escapeHTML(value);
		}
	);
}
/* The web app manifest of one language: the Japanese file with its texts and start page replaced. */
export function renderManifest(base: string, lang: unknown): string {
	const language = known(lang);
	const t = translator(language);
	const manifest = JSON.parse(base) as { screenshots?: { label?: string }[] } & Record<
		string,
		unknown
	>;
	manifest.name = t('manifest.name');
	manifest.description = t('manifest.description');
	manifest.lang = language;
	manifest.start_url = home(language);
	const labels = [t('manifest.screenshot_wide'), t('manifest.screenshot_narrow')];
	manifest.screenshots?.forEach((s, i) => {
		s.label = labels[i] ?? s.label;
	});
	return JSON.stringify(manifest, null, 2) + '\n';
}
