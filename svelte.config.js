import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-cloudflare overwrites whatever the wrangler config names as `main`; it reads
		// wrangler.adapter.jsonc so worker/entry.ts (the deployed entry) is left alone.
		adapter: adapter({ config: 'wrangler.adapter.jsonc' }),
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
