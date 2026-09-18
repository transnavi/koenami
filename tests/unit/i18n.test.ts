import { readFileSync } from 'node:fs';

import {
	LANGUAGES,
	CATALOGUES,
	OG_LOCALES,
	FONTS,
	fontCut,
	known,
	home,
	matchLanguage,
	languageOf,
	translator,
	renderPage,
	renderManifest
} from '@app/i18n/index';
import { describe, it, expect } from 'vitest';

import { golden } from './golden';

// The interface catalogues and the page renderer, pinned as the studio's pages see
// them: one document per language, the Worker matching Accept-Language, and the
// translator's placeholder, number and plural handling.
describe('i18n', () => {
	it('served languages, their homes, locales and font cuts', () => {
		golden('i18n.languages', {
			languages: LANGUAGES,
			homes: Object.fromEntries(LANGUAGES.map((l) => [l, home(l)])),
			locales: OG_LOCALES,
			fonts: FONTS,
			cuts: Object.fromEntries([...LANGUAGES, 'xx'].map((l) => [l, fontCut(l)])),
			known: ['ja', 'en', 'zh-CN', 'ko', 'xx', '', null, undefined].map((l) => known(l as string))
		});
	});
	it('matchLanguage: quality order, primary subtags, unknown tags, empty and malformed headers', () => {
		golden(
			'i18n.match-language',
			[
				'ja',
				'en-US,en;q=0.9,ja;q=0.8',
				'zh-TW,zh;q=0.9',
				'zh-CN',
				'ko-KR;q=0.5,en;q=0.9',
				'fr,de;q=0.8',
				'ko;q=0',
				'',
				null,
				'  en ; q = 0.5 , KO',
				'x-klingon,zh-Hans'
			].map((header) => [header, matchLanguage(header as string)])
		);
	});
	it('languageOf: page paths and the result page query', () => {
		golden(
			'i18n.language-of',
			[
				'/',
				'/ja/',
				'/en/',
				'/zh-CN/',
				'/ko',
				'/xx/',
				'/r?l=en',
				'/r?l=xx',
				'/r',
				'/en/r?l=ko',
				'/guide.html'
			].map((u) => [u, languageOf(u)])
		);
	});
	it('translator: plain keys, placeholders, numbers, plurals, lists and a missing key', () => {
		const out: Record<string, unknown> = {};
		for (const lang of LANGUAGES) {
			const t = translator(lang);
			out[lang] = {
				plain: t('nav.guide'),
				placeholder: t('target.analysis_error', { message: 'x <y>' }),
				number: t('jvs.added', { n: 1234 }),
				pluralOne: t('jvs.added', { n: 1 }),
				pluralZero: t('jvs.added', { n: 0 }),
				pluralUnset: t('jvs.added'),
				unknownPlaceholder: t('signal.word_title', { start: '0:01' }),
				list: t('metric.delta_f.factors'),
				listIsCopy: t('metric.delta_f.factors') !== t('metric.delta_f.factors')
			};
		}
		out.fallback = translator('xx')('nav.guide');
		golden('i18n.translator', out);
		expect(() => translator('ja')('no.such.key')).toThrow('i18n: no message for no.such.key');
	});
	it('renderPage: every token kind, the head links per language, the result page, unknown fields', () => {
		const template = [
			'<html lang="{{lang}}"><head>{{links}}<meta property="og:locale" content="{{og_locale}}"><meta property="og:url" content="{{url}}">',
			'<script type="application/ld+json">{"name":"{{j:page.publisher}}","d":"{{j:page.description}}"}</script></head>',
			'<body><a href="{{home}}">{{t:nav.guide}}</a><p>{{h:share.note}}</p><p title="{{t:share.note}}"></p><span title="{{t:common.close}}">{{t:common.close}}</span></body></html>'
		].join('');
		golden('i18n.render-page', {
			pages: Object.fromEntries(LANGUAGES.map((l) => [l, renderPage(template, l, home(l))])),
			result: renderPage(template, 'en', '/r'),
			unknownLanguage: renderPage('{{lang}}', 'xx', '/')
		});
		expect(() => renderPage('{{nope}}', 'ja', '/')).toThrow('i18n: unknown page field nope');
	});
	// The studio's and the result page's real head, rendered per language: the canonical,
	// hreflang, manifest and sitemap links and the Open Graph address, which the browser
	// goldens never see (they project the body).
	it('the head links of the studio and the result page, per language', () => {
		const tree = process.env.KOENAMI_TREE === 'new' ? 'src/lib/studio' : 'tests/old-tree/web';
		const read = (name: string) => readFileSync(`${tree}/${name}`, 'utf8');
		const heads = {
			studio: read(tree.startsWith('src') ? 'head.html' : 'index.html'),
			result: read(tree.startsWith('src') ? 'result-head.html' : 'result.html')
		};
		const links = (html: string) => ({
			title: html.match(/<title>([^<]*)<\/title>/)?.[1],
			url: html.match(/<meta property="og:url" content="([^"]*)"/)?.[1],
			links: [...html.matchAll(/<link rel="(canonical|alternate|manifest|sitemap)"[^>]*>/g)].map(
				(m) => m[0]
			)
		});
		golden('i18n.head-links', {
			studio: Object.fromEntries(
				[...LANGUAGES, 'lab'].map((l) => [
					l,
					links(renderPage(heads.studio, known(l), home(known(l))))
				])
			),
			result: Object.fromEntries(
				LANGUAGES.map((l) => [l, links(renderPage(heads.result, l, '/r'))])
			)
		});
	});
	it('renderManifest: the Japanese manifest re-labelled per language', () => {
		const base = JSON.stringify({
			name: 'Koenami',
			short_name: 'Koenami',
			description: 'x',
			lang: 'ja',
			start_url: '/',
			screenshots: [
				{ src: 'a.png', label: 'wide' },
				{ src: 'b.png', label: 'narrow' },
				{ src: 'c.png', label: 'third' }
			]
		});
		golden('i18n.render-manifest', {
			...Object.fromEntries(LANGUAGES.map((l) => [l, renderManifest(base, l)])),
			withoutScreenshots: renderManifest('{"name":"x"}', 'ko')
		});
	});
	// Every key exists in every language with the same kind of value (a text, a {one, other}
	// pair with an `other` form, or a list of the same length) and the same placeholders.
	it('catalogues share their keys, shapes and placeholders', () => {
		const ja = CATALOGUES.ja as Record<string, unknown>;
		const placeholders = (s: unknown) =>
			[...String(s).matchAll(/\{(\w+)\}/g)]
				.map((m) => m[1])
				.sort()
				.join(',');
		const shape = (v: unknown) => (Array.isArray(v) ? `list:${v.length}` : 'text');
		const forms = (v: unknown) => (typeof v === 'string' ? [v] : Object.values(v as object));
		const itemText = (x: unknown) =>
			typeof x === 'string'
				? x
				: (x as { title: string; text: string }).title + (x as { text: string }).text;
		for (const lang of LANGUAGES) {
			const messages = (CATALOGUES as Record<string, Record<string, unknown>>)[lang];
			expect(Object.keys(messages).sort(), `${lang}: key set`).toEqual(Object.keys(ja).sort());
			for (const [key, value] of Object.entries(ja)) {
				const other = messages[key];
				expect(shape(other), `${lang}: ${key} shape`).toBe(shape(value));
				if (Array.isArray(value))
					value.forEach((item, i) =>
						expect(placeholders(itemText((other as unknown[])[i])), `${lang}: ${key}[${i}]`).toBe(
							placeholders(itemText(item))
						)
					);
				else {
					if (typeof other === 'object') expect(other, `${lang}: ${key}`).toHaveProperty('other');
					for (const form of forms(other))
						expect(placeholders(form), `${lang}: ${key} placeholders`).toBe(
							placeholders(forms(value).join(' '))
						);
				}
			}
		}
	});
});
