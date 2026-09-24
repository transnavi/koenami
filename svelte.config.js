import { readFileSync } from 'node:fs';

import adapter from '@sveltejs/adapter-cloudflare';

// The languages other than Japanese, each served under /<lang>/ (project.inlang lists them).
const { baseLocale, locales } = JSON.parse(readFileSync('project.inlang/settings.json', 'utf8'));
const prefixed = locales.filter((/** @type {string} */ l) => l !== baseLocale);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-cloudflare overwrites whatever the wrangler config names as `main`; it reads
		// wrangler.adapter.jsonc so worker/entry.ts (the deployed entry) is left alone.
		// The platform proxy the adapter starts while prerendering reads the same file; the
		// Worker's own config declares a container that the proxy cannot emulate.
		adapter: adapter({
			config: 'wrangler.adapter.jsonc',
			platformProxy: { configPath: 'wrangler.adapter.jsonc' }
		}),
		// Every route with a prerender flag, plus each language's copy of the pages that have one:
		// the studio at /<lang>/ (and /ja/, the root's duplicate, and /lab/, the research
		// library), the result page, the manifest, and the English practice guide. Crawling is
		// off because it would also follow the sitemap link, which prepare_public.py writes at
		// deploy time.
		prerender: {
			entries: [
				'*',
				`/${baseLocale}/`,
				'/lab/',
				...prefixed.flatMap((/** @type {string} */ l) => [
					`/${l}/`,
					`/${l}/r`,
					`/${l}/site.webmanifest`
				]),
				'/en/tutorial.html'
			],
			crawl: false
		},
		// Absolute asset paths: the Worker serves the root document at /ja/ as well, where a
		// relative ./_app/… would resolve under /ja/.
		paths: { relative: false },
		serviceWorker: { register: false },
		// The headers prepare_public.py writes for the static site today; Kit nonces its own
		// bootstrap and the theme script. Cloudflare Web Analytics injects its beacon at the
		// edge, so its script and endpoint are admitted. 'wasm-unsafe-eval' lets the
		// measurement worker compile its module: the narrow permission for WebAssembly,
		// which does not admit eval or inline script. 'wasm-unsafe-eval' lets the
		// measurement worker compile its module: the narrow permission for WebAssembly,
		// which does not admit eval or inline script.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'wasm-unsafe-eval', 'https://static.cloudflareinsights.com'],
				'worker-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'media-src': ['self', 'blob:'],
				'connect-src': ['self', 'https://cloudflareinsights.com'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
