import { renderPage } from '$lib/i18n';
import body from '$lib/studio/result-body.html?raw';
import head from '$lib/studio/result-head.html?raw';

import type { PageLoad } from './$types';

// The shared-result page, rendered from the catalogue for Japanese at /r; the other
// languages have theirs under /<lang>/r. The per-result title and preview tags that
// worker.ts writes from the query string stay a Worker concern: the Kit worker entry
// wraps this page's response in the same rewriter when it takes over serving, so the
// static file the suite loads is the unrewritten shell.
export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () => ({
	lang: 'ja',
	head: renderPage(head, 'ja', '/r'),
	body: renderPage(body, 'ja', '/r')
});
