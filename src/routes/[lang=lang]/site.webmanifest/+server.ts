import { LANGUAGES, renderManifest } from '$lib/i18n';

import manifest from '../../../../static/site.webmanifest?raw';
import type { EntryGenerator, RequestHandler } from './$types';

// The web app manifest of each other language, prerendered next to its page: the Japanese
// file at /site.webmanifest with the texts and the start page replaced.
export const prerender = true;
export const entries: EntryGenerator = () =>
	LANGUAGES.filter((lang) => lang !== 'ja').map((lang) => ({ lang }));
export const GET: RequestHandler = ({ params }) =>
	new Response(renderManifest(manifest, params.lang), {
		headers: { 'content-type': 'application/manifest+json' }
	});
