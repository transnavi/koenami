import type { Handle } from '@sveltejs/kit';

// The non-CSP headers prepare_public.py writes for the static site today (the CSP is
// kit.csp in svelte.config.js). %lang% is fixed to Japanese until the localized routes
// arrive, which will set it per request.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', 'ja') });
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	return response;
};
