import body from '$lib/studio/tutorial-en-body.html?raw';
import head from '$lib/studio/tutorial-en-head.html?raw';

import type { PageLoad } from './$types';

export const prerender = true;
export const trailingSlash = 'never';
export const load: PageLoad = () => ({ head, body });
