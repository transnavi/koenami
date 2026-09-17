// Checks the interface catalogues against each other and the page rendering: node i18n_test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGUES, LANGUAGES, translator, renderPage, renderManifest, languageOf, matchLanguage, home } from './web/i18n/index.js';

const ja = CATALOGUES.ja;
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
// A text is a string or, where the language inflects by count, {one, other}; lists must match in length.
const shape = (v) => (Array.isArray(v) ? `list:${v.length}` : 'text');
for (const lang of LANGUAGES) {
 const messages = CATALOGUES[lang];
 // Every key exists in every language, with the same kind of value and the same placeholders.
 assert.deepEqual(Object.keys(messages).sort(), Object.keys(ja).sort(), `${lang}: key set`);
 for (const [key, value] of Object.entries(ja)) {
  const other = messages[key];
  assert.equal(shape(other), shape(value), `${lang}: ${key} shape`);
  const forms = (v) => (typeof v === 'string' ? [v] : Object.values(v));
  if (Array.isArray(value)) value.forEach((item, i) => { const a = other[i], text = (x) => (typeof x === 'string' ? x : x.title + x.text); assert.equal(placeholders(text(a)), placeholders(text(item)), `${lang}: ${key}[${i}] placeholders`); });
  else {
   if (typeof other === 'object') assert.ok('other' in other, `${lang}: ${key} needs an "other" form`);
   for (const form of forms(other)) assert.equal(placeholders(form), placeholders(forms(value).join(' ')), `${lang}: ${key} placeholders`);
  }
 }
 const t = translator(lang);
 assert.equal(typeof t('page.title'), 'string');
 assert.ok(t('corpus.clips', { n: 1675 }).includes((1675).toLocaleString(lang)), `${lang}: number grouping`);
 assert.equal(t('tour.steps').length, 9);
}
assert.equal(translator('en')('corpus.clips', { n: 1 }), '1 clip');
assert.equal(translator('en')('corpus.clips', { n: 2 }), '2 clips');
assert.equal(translator('ja')('corpus.clips', { n: 1 }), '1音声');
assert.throws(() => translator('ja')('no.such.key'));
console.log('catalogues: ok');

// Language resolution.
assert.equal(languageOf('/en/'), 'en');
assert.equal(languageOf('/ja/'), 'ja');
assert.equal(languageOf('/'), 'ja');
assert.equal(languageOf('/r?l=ko&f0=200'), 'ko');
assert.equal(languageOf('/lab/'), 'ja');
assert.equal(matchLanguage('en-US,en;q=0.9'), 'en');
assert.equal(matchLanguage('zh'), 'zh-CN');
assert.equal(matchLanguage('zh-TW'), 'zh-CN');
assert.equal(matchLanguage(''), 'ja');
assert.equal(matchLanguage(null), 'ja');
console.log('resolution: ok');

// Page rendering: every token resolves, escaping holds, and each language names its own page.
const index = readFileSync('web/index.html', 'utf8'), result = readFileSync('web/result.html', 'utf8');
for (const lang of LANGUAGES) {
 const page = renderPage(index, lang, lang === 'ja' ? '/' : `/${lang}/`);
 assert.ok(!/\{\{/.test(page), `${lang}: unresolved token`);
 assert.ok(page.startsWith(`<!doctype html><html lang="${lang}">`), `${lang}: html lang`);
 assert.ok(page.includes(`<link rel="canonical" href="https://koe.transnavi.jp${lang === 'ja' ? '/' : `/${lang}/`}">`), `${lang}: canonical`);
 assert.ok(page.includes('<link rel="alternate" hreflang="x-default" href="https://koe.transnavi.jp/">'), `${lang}: x-default`);
 assert.ok(page.includes(`<title>${CATALOGUES[lang]['page.title'].replace(/&/g, '&amp;')}</title>`), `${lang}: title`);
 assert.ok(page.includes(`"inLanguage":"${lang}"`), `${lang}: structured data`);
 JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page)[1]);
 const r = renderPage(result, lang, '/r');
 assert.ok(!/\{\{/.test(r) && r.includes(`<html lang="${lang}">`), `${lang}: result page`);
 const manifest = JSON.parse(renderManifest(readFileSync('web/public/site.webmanifest', 'utf8'), lang));
 assert.equal(manifest.lang, lang);
 assert.equal(manifest.start_url, lang === 'ja' ? '/' : `/${lang}/`);
}
assert.equal(home('ja'), '/', 'the Japanese page (also served at /ja/) names the root as its address');
assert.throws(() => renderPage('{{nope}}', 'ja', '/'));
console.log('pages: ok');
