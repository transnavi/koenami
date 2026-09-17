/* The interface languages: one catalogue per language, a translator over it, and the
   page rendering the build uses to write /, /zh-CN/, /en/ and /ko/ as separate documents.
   This module runs in the browser, in the Worker and in Node (vite.web.config.js), so it
   touches `document` only behind a guard. */
import ja from './ja.js';
import zh from './zh-CN.js';
import en from './en.js';
import ko from './ko.js';

export const LANGUAGES = ['ja', 'zh-CN', 'en', 'ko'];
export const CATALOGUES = { ja, 'zh-CN': zh, en, ko };
export const OG_LOCALES = { ja: 'ja_JP', 'zh-CN': 'zh_CN', en: 'en_US', ko: 'ko_KR' };
/* The card font per language: the share font is a Noto Sans subset in three regional cuts. */
export const FONTS = { ja: 'Noto Sans JP', 'zh-CN': 'Noto Sans SC', en: 'Noto Sans JP', ko: 'Noto Sans KR' };
export const SITE = 'https://koe.transnavi.jp';
/* The share font ships in three cuts of Noto Sans; English uses the Japanese cut's Latin glyphs. */
export const fontCut = (lang) => (lang === 'ko' || lang === 'zh-CN' ? lang : 'ja');

export const known = (lang) => (LANGUAGES.includes(lang) ? lang : 'ja');
/* The studio's address in a language; Japanese lives at the root. */
export const home = (lang) => (lang === 'ja' ? '/' : `/${lang}/`);
/* An Accept-Language value, or any language tag, reduced to a served language. */
export function matchLanguage(header) {
 const first = String(header || '').split(',')[0].trim().split(';')[0];
 if (LANGUAGES.includes(first)) return first;
 const primary = first.split('-')[0].toLowerCase();
 return LANGUAGES.find((l) => l.split('-')[0] === primary) || 'ja';
}
/* The language a request addresses: /<lang>/ pages, and ?l=<lang> on the result page. */
export function languageOf(url) {
 const { pathname, searchParams } = new URL(url, 'http://localhost');
 const segment = pathname.split('/')[1];
 if (LANGUAGES.includes(segment)) return segment;
 return known(searchParams.get('l'));
}

const rules = new Map();
export function translator(lang) {
 lang = known(lang);
 const messages = CATALOGUES[lang];
 if (!rules.has(lang)) rules.set(lang, new Intl.PluralRules(lang));
 const plural = rules.get(lang);
 /* t(key, params): a string with {name} filled in (numbers in the language's digit
    grouping), or the array a list key holds. A {one, other} entry picks its form by
    params.n. A missing key is a programming error. */
 return function t(key, params) {
  let value = messages[key];
  if (value === undefined) value = ja[key];
  if (value === undefined) throw new Error(`i18n: no message for ${key}`);
  if (value && typeof value === 'object' && !Array.isArray(value)) value = value[plural.select(Number(params?.n) || 0)] ?? value.other;
  if (typeof value !== 'string' || !params) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (!(name in params) ? m : typeof params[name] === 'number' ? params[name].toLocaleString(lang) : String(params[name])));
 };
}

/* The browser's language is the document's; the Worker and the build pass one explicitly. */
export const lang = typeof document === 'undefined' ? 'ja' : known(document.documentElement.lang);
export const t = translator(lang);

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const escapeJSON = (s) => JSON.stringify(String(s)).slice(1, -1);
/* Fills a page template for one language. Tokens: {{t:key}} (HTML-escaped text), {{h:key}}
   (markup from the catalogue), {{j:key}} (inside a JSON string), and the page fields
   {{lang}}, {{og_locale}}, {{home}}, {{url}}, {{links}} (canonical, hreflang alternates and
   the manifest). `path` is the page's address on the site, so every language names its own
   canonical while /ja/ points at the root it duplicates. */
export function renderPage(template, lang, path) {
 lang = known(lang);
 const t = translator(lang);
 const fields = {
  lang,
  og_locale: OG_LOCALES[lang],
  home: home(lang),
  url: SITE + path,
  links: path === '/r' ? '' : [
   `<link rel="canonical" href="${SITE}${path}">`,
   ...LANGUAGES.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${home(l)}">`),
   `<link rel="alternate" hreflang="x-default" href="${SITE}/">`,
   `<link rel="manifest" href="${lang === 'ja' ? '/site.webmanifest' : `/${lang}/site.webmanifest`}">`
  ].join('')
 };
 return template.replace(/\{\{(?:(t|h|j):([\w.-]+)|(\w+))\}\}/g, (m, kind, key, field) => {
  if (field) { if (!(field in fields)) throw new Error(`i18n: unknown page field ${field}`); return fields[field]; }
  const value = t(key);
  return kind === 'h' ? value : kind === 'j' ? escapeJSON(value) : escapeHTML(value);
 });
}
/* The web app manifest of one language: the Japanese file with its texts and start page replaced. */
export function renderManifest(base, lang) {
 lang = known(lang);
 const t = translator(lang), manifest = JSON.parse(base);
 manifest.name = t('manifest.name');
 manifest.description = t('manifest.description');
 manifest.lang = lang;
 manifest.start_url = home(lang);
 const labels = [t('manifest.screenshot_wide'), t('manifest.screenshot_narrow')];
 manifest.screenshots?.forEach((s, i) => { s.label = labels[i] ?? s.label; });
 return JSON.stringify(manifest, null, 2) + '\n';
}
