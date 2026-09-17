// Wrangler's entry for the SvelteKit build: the Kit worker handles every request and the
// container class is exported next to it. adapter-cloudflare overwrites whatever the main
// wrangler config names as `main`, so the adapter reads wrangler.adapter.jsonc instead and
// this file stays in place (see svelte.config.js).
export { default } from '../.svelte-kit/cloudflare/_worker.js';
export { VoiceAnalyzer } from './analyzer';
