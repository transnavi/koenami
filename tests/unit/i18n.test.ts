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
	it('catalogues share their keys', () => {
		const keys = Object.keys(CATALOGUES.ja).sort();
		for (const lang of LANGUAGES)
			expect(Object.keys((CATALOGUES as Record<string, object>)[lang]).sort()).toEqual(keys);
	});
});
