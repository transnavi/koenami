import { defineCustomServerStrategy, extractLocaleFromUrl, isLocale } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import type { Handle } from '@sveltejs/kit';

// The result page is in the language its link names (/r?l=en), else its path's (/en/r);
// paraglide.config.js applies this strategy to the result page only.
defineCustomServerStrategy('custom-result', {
	getLocale: (request) => {
		if (!request) return undefined;
		const url = new URL(request.url),
			l = url.searchParams.get('l');
		return isLocale(l) ? l : extractLocaleFromUrl(url);
	}
});

// Each request runs in its locale, so messages resolve without a language being passed
// around; the reroute in hooks.ts sends /lab/ to the Japanese studio. The other headers are
// the non-CSP ones prepare_public.py writes for the static site (the CSP is kit.csp in
// svelte.config.js), set on whatever the middleware answers.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replaceAll('%lang%', locale)
		});
	});
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	return response;
};
