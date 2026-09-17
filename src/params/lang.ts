import type { ParamMatcher } from '@sveltejs/kit';
import { LANGUAGES } from '$lib/languages';

export const match: ParamMatcher = (param) => (LANGUAGES as readonly string[]).includes(param);
