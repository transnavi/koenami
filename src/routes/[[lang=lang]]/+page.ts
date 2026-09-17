import type { EntryGenerator } from './$types';
import { LANGUAGES } from '$lib/languages';

// One static page per language path; the studio reads the language from the path and
// pushes /<lang>/ itself, so the trailing slash is part of the address.
export const prerender = true;
export const trailingSlash = 'always';
export const entries: EntryGenerator = () => [{}, ...LANGUAGES.map((lang) => ({ lang }))];
