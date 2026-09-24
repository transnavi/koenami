import { deLocalizeUrl } from '$lib/paraglide/runtime';
import type { Reroute } from '@sveltejs/kit';

// A locale prefix names a language, not a route: /en/ and /ja/ are the studio at /, /en/r the
// result page. /lab/ is the research library's studio, a Japanese page of the same route.
export const reroute: Reroute = ({ url }) => {
	const path = deLocalizeUrl(url).pathname;
	return path === '/lab/' ? '/' : path;
};
