import { LANGUAGES } from '$lib/languages';
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => (LANGUAGES as readonly string[]).includes(param);
