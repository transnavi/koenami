import { LANGUAGES } from '$lib/languages';
import type { ParamMatcher } from '@sveltejs/kit';

// The served languages, and the research library (`lab`): a language of the private
// analyzer's catalog with no catalogue of its own, whose page is the Japanese one.
export const match: ParamMatcher = (param) =>
	(LANGUAGES as readonly string[]).includes(param) || param === 'lab';
