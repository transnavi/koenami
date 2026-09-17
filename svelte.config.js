import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = { kit: { adapter: adapter({ config: 'wrangler.adapter.jsonc' }) } };

export default config;
