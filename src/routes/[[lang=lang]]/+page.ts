import { home, known, renderPage } from '$lib/i18n';
import { LANGUAGES } from '$lib/languages';
import body from '$lib/studio/body.html?raw';
import head from '$lib/studio/head.html?raw';

import type { EntryGenerator, PageLoad } from './$types';

// One static page per language path, the studio's markup rendered from the catalogue
// at build time; the studio reads the language from the path and pushes /<lang>/ itself,
// so the trailing slash is part of the address.
export const prerender = true;
export const trailingSlash = 'always';
// `lab` is the research library, a language of the private analyzer's catalog with no
// catalogue of its own: its page is the Japanese document, canonical at the root, as the
// static server rendered it at /lab/.
export const entries: EntryGenerator = () => [
	{},
	...LANGUAGES.map((lang) => ({ lang })),
	{ lang: 'lab' }
];
export const load: PageLoad = ({ params }) => {
	const lang = known(params.lang);
	return {
		head: renderPage(head, lang, home(lang)),
		body: renderPage(body, lang, home(lang))
	};
};
