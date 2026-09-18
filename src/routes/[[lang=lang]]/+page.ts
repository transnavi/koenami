import { LANGUAGES } from '$lib/languages';
import { home, renderPage } from '$lib/i18n';
import head from '$lib/studio/head.html?raw';
import body from '$lib/studio/body.html?raw';

import type { EntryGenerator, PageLoad } from './$types';

// One static page per language path, the studio's markup rendered from the catalogue
// at build time; the studio reads the language from the path and pushes /<lang>/ itself,
// so the trailing slash is part of the address.
export const prerender = true;
export const trailingSlash = 'always';
export const entries: EntryGenerator = () => [{}, ...LANGUAGES.map((lang) => ({ lang }))];
export const load: PageLoad = ({ params }) => {
	const lang = params.lang ?? 'ja';
	return { lang, head: renderPage(head, lang, home(lang)), body: renderPage(body, lang, home(lang)) };
};
