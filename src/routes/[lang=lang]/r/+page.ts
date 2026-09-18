import { LANGUAGES } from '$lib/languages';
import { renderPage } from '$lib/i18n';
import head from '$lib/studio/result-head.html?raw';
import body from '$lib/studio/result-body.html?raw';

import type { EntryGenerator, PageLoad } from './$types';

// The shared-result page in a language other than Japanese; the Worker serves it for
// /r?l=<lang>. Prerendered as <lang>/r.html.
export const prerender = true;
export const trailingSlash = 'never';
export const entries: EntryGenerator = () => LANGUAGES.filter((lang) => lang !== 'ja').map((lang) => ({ lang }));
export const load: PageLoad = ({ params }) => ({ lang: params.lang, head: renderPage(head, params.lang, '/r'), body: renderPage(body, params.lang, '/r') });
