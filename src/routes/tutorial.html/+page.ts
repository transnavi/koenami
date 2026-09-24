import { getLocale } from '$lib/paraglide/runtime';
import body from '$lib/studio/tutorial-body.html?raw';
import enBody from '$lib/studio/tutorial-en-body.html?raw';
import enHead from '$lib/studio/tutorial-en-head.html?raw';
import head from '$lib/studio/tutorial-head.html?raw';

import type { PageLoad } from './$types';

// The practice guide, written in Japanese at /tutorial.html and in English at /en/tutorial.html;
// the other languages link to the Japanese page.
export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () =>
	getLocale() === 'en' ? { head: enHead, body: enBody } : { head, body };
