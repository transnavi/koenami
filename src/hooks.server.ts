import type { Handle } from '@sveltejs/kit';

// The headers prepare_public.py writes for the static site today. Cloudflare Web
// Analytics injects its beacon at the edge; the CSP admits that script and its endpoint.
const csp = [
	"default-src 'self'",
	"script-src 'self' https://static.cloudflareinsights.com",
	"worker-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob:",
	"media-src 'self' blob:",
	"connect-src 'self' https://cloudflareinsights.com",
	"frame-ancestors 'none'"
].join('; ');

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	response.headers.set('Content-Security-Policy', csp);
	return response;
};
