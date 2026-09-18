import body from '$lib/studio/references-body.html?raw';
import head from '$lib/studio/references-head.html?raw';

import type { PageLoad } from './$types';

// A page of its own at a file-like address, its markup verbatim from the studio's
// web/references.html; prerendered as one file.
export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () => ({ head, body });
