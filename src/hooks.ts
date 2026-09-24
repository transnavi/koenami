import { deLocalizeUrl, extractLocaleFromUrl } from '$lib/paraglide/runtime';
import type { Reroute } from '@sveltejs/kit';

// The pages a locale prefix (/en/, /ja/) may name: the studio, the result page and the web app
// manifest in every language, the practice guide in English. Any other prefixed path stays
// unmatched. The research library at /lab/ is the Japanese studio.
const everyLanguage = new Set(['/', '/r', '/site.webmanifest']);
export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/lab/') return '/';
	const path = deLocalizeUrl(url).pathname;
	if (everyLanguage.has(path)) return path;
	if (path === '/tutorial.html' && extractLocaleFromUrl(url) === 'en') return path;
	return url.pathname;
};
