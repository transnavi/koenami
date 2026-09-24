import { readFileSync } from 'node:fs';

import { cardSVG } from '@app/card';
import { fontCut, locales } from '@app/i18n/index';
import { describe, it, expect } from 'vitest';

// The share card must draw with the subset fonts alone (the Worker loads no system fonts),
// so every character the card can show in a language has to be in that language's cut.
// The cut's cmap (formats 4 and 12) is read directly.
function codepoints(font: Buffer): Set<number> {
	const dv = new DataView(font.buffer, font.byteOffset, font.byteLength);
	const set = new Set<number>();
	let cmap = 0;
	for (let i = 0; i < dv.getUint16(4); i++) {
		const o = 12 + i * 16;
		if (String.fromCharCode(...font.subarray(o, o + 4)) === 'cmap') cmap = dv.getUint32(o + 8);
	}
	expect(cmap, 'cmap table').toBeTruthy();
	for (let i = 0; i < dv.getUint16(cmap + 2); i++) {
		const off = cmap + dv.getUint32(cmap + 8 + i * 8);
		const format = dv.getUint16(off);
		if (format === 4) {
			const segX2 = dv.getUint16(off + 6);
			const ends = off + 14;
			const starts = ends + segX2 + 2;
			const deltas = starts + segX2;
			const offsets = deltas + segX2;
			for (let s = 0; s < segX2 / 2; s++) {
				const end = dv.getUint16(ends + s * 2);
				const start = dv.getUint16(starts + s * 2);
				const delta = dv.getInt16(deltas + s * 2);
				const ro = dv.getUint16(offsets + s * 2);
				for (let c = start; c <= end && c !== 0xffff; c++) {
					let glyph = ro
						? dv.getUint16(offsets + s * 2 + ro + (c - start) * 2)
						: (c + delta) & 0xffff;
					if (ro && glyph) glyph = (glyph + delta) & 0xffff;
					if (glyph) set.add(c);
				}
			}
		} else if (format === 12) {
			for (let g = 0; g < dv.getUint32(off + 12); g++) {
				const o = off + 16 + g * 12;
				for (let c = dv.getUint32(o), e = dv.getUint32(o + 4); c <= e; c++) set.add(c);
			}
		}
	}
	return set;
}

const fonts = 'static/fonts';
const scorer = {
	bands: { female: [10, 40] as [number, number], male: [-40, -10] as [number, number] },
	metricBands: Object.fromEntries(
		['f0', 'delta_f', 'hnr', 'balance', 'pitch_span'].map((k) => [
			k,
			{ female: [1, 2], male: [0, 1] }
		])
	),
	cloud: []
};

describe('share font cuts', () => {
	for (const lang of locales)
		it(`${lang}: every character of the card is in the ${fontCut(lang)} cut`, () => {
			const glyphs = codepoints(readFileSync(`${fonts}/koenami-share-${fontCut(lang)}-400.ttf`));
			for (const verdict of ['female', 'androgynous', 'male']) {
				const result = {
					version: 1,
					score: 20,
					display: 20,
					verdict,
					point: [0.5, 0.5],
					features: { f0: 200, delta_f: 1100, hnr: 10, balance: -15, pitch_span: 5 },
					age: 27
				};
				// oxlint-disable-next-line typescript/no-explicit-any -- cardSVG's scorer stub is partial
				const text = (cardSVG as any)(result, scorer, { locale: lang })
					.replace(/<style>.*?<\/style>/s, '')
					.replace(/<[^>]+>/g, '')
					.replace(/&amp;/g, '&') as string;
				const missing = [...new Set(text)].filter(
					(c) => c.trim() && !glyphs.has(c.codePointAt(0)!)
				);
				expect(missing, `${lang} ${verdict}`).toEqual([]);
			}
		});
});
