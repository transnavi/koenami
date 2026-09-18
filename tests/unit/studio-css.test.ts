import { readFileSync } from 'node:fs';

import { transform } from 'lightningcss';
import { describe, it, expect } from 'vitest';

// The production build minifies the studio's stylesheet with Lightning CSS, which folds a
// prefixed and an unprefixed declaration of one property into the last of the two. A rule
// that lists `backdrop-filter` before `-webkit-backdrop-filter` therefore loses the
// standard declaration, and the phone layout's map tool box once shipped without its blur.
// The characterization suite runs the unminified coverage build and its screens mask the
// canvas under that box, so the minified output is checked here: every rule that blurs its
// backdrop in the source still does after minification.
describe.skipIf((process.env.KOENAMI_TREE || 'old') !== 'new')(
	'studio stylesheet through the minifier',
	() => {
		it('keeps the standard backdrop-filter of every blurred rule', () => {
			const source = readFileSync('src/lib/studio/studio.css', 'utf8');
			const minified = transform({
				filename: 'studio.css',
				code: Buffer.from(source),
				minify: true
			}).code.toString();
			const blurred = [
				...source.matchAll(/([^{}]+)\{[^{}]*?\bbackdrop-filter:\s*(blur\(\d+px\))[^{}]*\}/g)
			].map((m) => [m[1].trim().replace(/\s+/g, ' '), m[2]] as const);
			expect(blurred.length).toBeGreaterThan(3);
			for (const [selector, blur] of blurred) {
				const rule = new RegExp(
					`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^{}]*(?<![-\\w])backdrop-filter:${blur.replace(/[()]/g, '\\$&')}`
				);
				expect(minified, `${selector} keeps backdrop-filter: ${blur}`).toMatch(rule);
			}
		});
	}
);
