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
assert.equal(matchLanguage('fr-FR, en;q=0.9'), 'en');
assert.equal(matchLanguage('ja;q=0.1, en;q=0.9'), 'en');
assert.equal(matchLanguage('EN-us'), 'en');
assert.equal(matchLanguage('zh-cn'), 'zh-CN');
assert.equal(matchLanguage('fr, *;q=0.5'), 'ja');
assert.equal(matchLanguage('ko;q=0'), 'ja');
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

// The share card must draw with the subset fonts alone (the Worker loads no system fonts),
// so every character the card can show in a language has to be in that language's cut.
import { cardSVG } from './web/card.js';
import { fontCut } from './web/i18n/index.js';
function codepoints(font) {
 const dv = new DataView(font.buffer, font.byteOffset, font.byteLength), set = new Set();
 let cmap = 0;
 for (let i = 0; i < dv.getUint16(4); i++) { const o = 12 + i * 16; if (String.fromCharCode(...font.subarray(o, o + 4)) === 'cmap') cmap = dv.getUint32(o + 8); }
 assert.ok(cmap, 'cmap table');
 for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
  const off = cmap + dv.getUint32(cmap + 8 + i * 8), format = dv.getUint16(off);
  if (format === 4) {
   const segX2 = dv.getUint16(off + 6), ends = off + 14, starts = ends + segX2 + 2, deltas = starts + segX2, offsets = deltas + segX2;
   for (let s = 0; s < segX2 / 2; s++) {
    const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2), delta = dv.getInt16(deltas + s * 2), ro = dv.getUint16(offsets + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
     let glyph = ro ? dv.getUint16(offsets + s * 2 + ro + (c - start) * 2) : (c + delta) & 0xffff;
     if (ro && glyph) glyph = (glyph + delta) & 0xffff;
     if (glyph) set.add(c);
    }
   }
  } else if (format === 12) {
   for (let g = 0; g < dv.getUint32(off + 12); g++) { const o = off + 16 + g * 12; for (let c = dv.getUint32(o), e = dv.getUint32(o + 4); c <= e; c++) set.add(c); }
  }
 }
 return set;
}
const scorer = { bands: { female: [10, 40], male: [-40, -10] }, metricBands: Object.fromEntries(['f0', 'delta_f', 'hnr', 'balance', 'pitch_span'].map((k) => [k, { female: [1, 2], male: [0, 1] }])), cloud: [] };
for (const lang of LANGUAGES) {
 const glyphs = codepoints(readFileSync(`web/public/fonts/koenami-share-${fontCut(lang)}-400.ttf`));
 for (const verdict of ['female', 'androgynous', 'male']) {
  const result = { version: 1, score: 20, display: 20, verdict, point: [0.5, 0.5], features: { f0: 200, delta_f: 1100, hnr: 10, balance: -15, pitch_span: 5 }, age: 27 };
  const text = cardSVG(result, scorer, { lang }).replace(/<style>.*?<\/style>/s, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
  const missing = [...new Set(text)].filter((c) => c.trim() && !glyphs.has(c.codePointAt(0)));
  assert.deepEqual(missing, [], `${lang}: characters missing from the ${fontCut(lang)} share font: ${missing.join('')}`);
 }
}
console.log('share fonts: ok');
