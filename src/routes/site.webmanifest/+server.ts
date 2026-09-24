import { renderManifest } from '$lib/i18n';
import manifest from '$lib/site.webmanifest.json?raw';

import type { RequestHandler } from './$types';

// The web app manifest in each language, next to its studio page: /site.webmanifest and
// /<lang>/site.webmanifest.
export const prerender = true;
export const GET: RequestHandler = () =>
	new Response(renderManifest(manifest), {
		headers: { 'content-type': 'application/manifest+json' }
	});
