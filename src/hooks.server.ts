import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle } from '@sveltejs/kit';

// Each request runs in its locale, read from the path (/en/… is English, / and /lab/ are
// Japanese), so messages resolve without a language being passed around. The other headers
// are the non-CSP ones prepare_public.py writes for the static site (the CSP is kit.csp in
// svelte.config.js).
export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, async ({ request, locale }) => {
		event.request = request;
		const response = await resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
		response.headers.set('X-Content-Type-Options', 'nosniff');
		response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
		response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
		return response;
	});
