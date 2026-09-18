import type { Handle } from '@sveltejs/kit';
import { languageOf } from '$lib/i18n';

// The non-CSP headers prepare_public.py writes for the static site today (the CSP is
// kit.csp in svelte.config.js). %lang% is the language the path addresses; the prerendered
// pages have no query, and the result page's `l` is the Worker's concern when it serves /r.
export const handle: Handle = async ({ event, resolve }) => {
	const lang = languageOf(event.url.pathname);
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', lang)
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	return response;
};
