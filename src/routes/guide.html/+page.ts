import body from '$lib/studio/guide-body.html?raw';
import head from '$lib/studio/guide-head.html?raw';

import type { PageLoad } from './$types';

// A page of its own at a file-like address, its markup verbatim from the studio's
// web/guide.html; prerendered as one file.
export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () => ({ head, body });
