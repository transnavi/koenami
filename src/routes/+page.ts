import { home, renderPage } from '$lib/i18n';
import body from '$lib/studio/body.html?raw';
import head from '$lib/studio/head.html?raw';

import type { PageLoad } from './$types';

// The studio, one static page per language path (/, /ja/, /en/, /zh-CN/, /ko/ and the research
// library's /lab/; svelte.config.js lists them). The studio pushes /<lang>/ itself, so the
// trailing slash is part of the address.
export const prerender = true;
export const trailingSlash = 'always';
export const load: PageLoad = () => ({
	head: renderPage(head, home()),
	body: renderPage(body, home())
});
