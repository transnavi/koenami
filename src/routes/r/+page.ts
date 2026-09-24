import { renderPage } from '$lib/i18n';
import body from '$lib/studio/result-body.html?raw';
import head from '$lib/studio/result-head.html?raw';

import type { PageLoad } from './$types';

// The shared-result page: /r in Japanese, /<lang>/r in the others, which the Worker serves
// for /r?l=<lang>. The per-result title and preview tags that worker.ts writes from the query
// string stay a Worker concern, so the prerendered file is the unrewritten shell.
export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () => ({
	head: renderPage(head, '/r'),
	body: renderPage(body, '/r')
});
