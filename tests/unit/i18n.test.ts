import { readFileSync } from 'node:fs';

import {
	FONTS,
	OG_LOCALES,
	fontCut,
	home,
	locales,
	matchLanguage,
	message,
	messages,
	renderManifest,
	renderPage,
	tutorialHref,
	tutorialLang
} from '@app/i18n/index';
import { m } from '@app/paraglide/messages';
import { extractLocaleFromUrl } from '@app/paraglide/runtime';
import { describe, it, expect } from 'vitest';

import { reroute } from '../../src/hooks';
import { golden } from './golden';

// The languages as the site serves them: one document per language, the route a localized
// address resolves to, the Worker matching Accept-Language, the messages' placeholder, number
// and plural handling, and the page templates rendered per language.
describe('i18n', () => {
	it('served languages, their homes, guides, locales and font cuts', () => {
		golden('i18n.languages', {
			languages: locales,
			homes: Object.fromEntries(locales.map((l) => [l, home(l)])),
			guides: Object.fromEntries(locales.map((l) => [l, [tutorialHref(l), tutorialLang(l)]])),
			locales: OG_LOCALES,
			fonts: FONTS,
			cuts: Object.fromEntries(locales.map((l) => [l, fontCut(l)]))
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
	// A localized address names a language and a route: the prefix picks the locale, the rest
	// of the path the page (the research library at /lab/ is the Japanese studio).
	it('localized addresses: the locale each path is in and the route it resolves to', () => {
		golden(
			'i18n.addresses',
			[
				'/',
				'/ja/',
				'/en/',
				'/zh-CN/',
				'/ko/',
				'/lab/',
				'/xx/',
				'/r',
				'/en/r',
				'/en/tutorial.html',
				'/ko/site.webmanifest',
				'/guide.html'
			].map((path) => {
				const url = new URL(path, 'https://koe.transnavi.jp');
				return [path, extractLocaleFromUrl(url), reroute({ url, fetch } as never)];
			})
		);
	});
	it('messages: plain, placeholders, numbers, plurals, lists, a locale option and a missing id', () => {
		const out: Record<string, unknown> = {};
		for (const locale of locales)
			out[locale] = {
				plain: m.nav_guide({}, { locale }),
				placeholder: m.target_analysis_error({ message: 'x <y>' }, { locale }),
				number: m.jvs_added({ n: 1234 }, { locale }),
				pluralOne: m.jvs_added({ n: 1 }, { locale }),
				pluralZero: m.jvs_added({ n: 0 }, { locale }),
				byId: message('nav_guide')({}, { locale }),
				list: messages('metric_delta_f_factors', locale)
			};
		// Outside a request the locale is the base one.
		out.default = m.nav_guide();
		golden('i18n.messages', out);
		expect(() => message('no_such_message')).toThrow('i18n: no message no_such_message');
	});
	it('renderPage: every token kind, the head links per language, the result page, unknown fields', () => {
		const template = [
			'<html lang="{{lang}}"><head>{{links}}<meta property="og:locale" content="{{og_locale}}"><meta property="og:url" content="{{url}}">',
			'<script type="application/ld+json">{"name":"{{j:page_publisher}}","d":"{{j:page_description}}"}</script></head>',
			'<body><a href="{{home}}">{{t:nav_guide}}</a><a href="{{tutorial}}" hreflang="{{tutorial_lang}}"></a><p>{{h:share_note}}</p><p title="{{t:share_note}}"></p><span title="{{t:common_close}}">{{t:common_close}}</span></body></html>'
		].join('');
		golden('i18n.render-page', {
			pages: Object.fromEntries(locales.map((l) => [l, renderPage(template, home(l), l)])),
			result: renderPage(template, '/r', 'en'),
			default: renderPage('{{lang}} {{home}}', '/')
		});
		expect(() => renderPage('{{nope}}', '/')).toThrow('i18n: unknown page field nope');
		expect(() => renderPage('{{t:nope}}', '/')).toThrow('i18n: no message nope');
	});
	// The studio's and the result page's real head, rendered per language: the canonical,
	// hreflang, manifest and sitemap links and the Open Graph address, which the browser
	// goldens never see (they project the body).
	it('the head links of the studio and the result page, per language', () => {
		const read = (name: string) => readFileSync(`src/lib/studio/${name}`, 'utf8');
		const heads = { studio: read('head.html'), result: read('result-head.html') };
		const links = (html: string) => ({
			title: html.match(/<title>([^<]*)<\/title>/)?.[1],
			url: html.match(/<meta property="og:url" content="([^"]*)"/)?.[1],
			links: [...html.matchAll(/<link rel="(canonical|alternate|manifest|sitemap)"[^>]*>/g)].map(
				(match) => match[0]
			)
		});
		golden('i18n.head-links', {
			studio: Object.fromEntries(
				locales.map((l) => [l, links(renderPage(heads.studio, home(l), l))])
			),
			result: Object.fromEntries(locales.map((l) => [l, links(renderPage(heads.result, '/r', l))]))
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
			...Object.fromEntries(locales.map((l) => [l, renderManifest(base, l)])),
			withoutScreenshots: renderManifest('{"name":"x"}', 'ko')
		});
	});
	// Every message exists in every language, with the same inputs: a text's placeholders, or a
	// complex message's declared inputs and every variant's placeholders.
	it('messages share their ids and inputs across languages', () => {
		type Variant = { declarations: string[]; match: Record<string, string> };
		const load = (locale: string) =>
			JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')) as Record<
				string,
				string | Variant[]
			>;
		const inputs = (value: string | Variant[]) => {
			const names = new Set<string>();
			const texts =
				typeof value === 'string'
					? [value]
					: value.flatMap((v) => {
							for (const d of v.declarations)
								if (d.startsWith('input ')) names.add(d.slice(6).trim());
							return Object.values(v.match);
						});
			const locals = new Set(
				typeof value === 'string'
					? []
					: value.flatMap((v) =>
							v.declarations.filter((d) => d.startsWith('local ')).map((d) => d.split(' ')[1])
						)
			);
			for (const text of texts)
				for (const [, name] of text.matchAll(/\{(\w+)\}/g)) if (!locals.has(name)) names.add(name);
			return [...names].sort().join(',');
		};
		const base = load('ja');
		for (const locale of locales) {
			const other = load(locale);
			expect(Object.keys(other).sort(), `${locale}: ids`).toEqual(Object.keys(base).sort());
			for (const [id, value] of Object.entries(base)) {
				if (id === '$schema') continue;
				expect(inputs(other[id]), `${locale}: ${id} inputs`).toBe(inputs(value));
			}
		}
	});
});
