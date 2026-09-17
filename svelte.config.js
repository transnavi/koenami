import adapter from '@sveltejs/adapter-cloudflare';

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
		// The studio lives at / and /<lang>/ (it pushes the trailing slash itself); the other
		// pages keep their file-like paths.
		// Every page, listed: crawling would also follow the sitemap link, which prepare_public.py
		// writes at deploy time.
		prerender: {
			entries: [
				'/',
				'/ja/',
				'/zh-CN/',
				'/en/',
				'/ko/',
				'/r',
				'/method.html',
				'/guide.html',
				'/tutorial.html',
				'/references.html',
				'/review.html',
				'/pairs.html'
			],
			crawl: false
		},
		// The headers prepare_public.py writes for the static site today; Kit nonces its own
		// bootstrap and the theme script. Cloudflare Web Analytics injects its beacon at the
		// edge, so its script and endpoint are admitted.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://static.cloudflareinsights.com'],
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
