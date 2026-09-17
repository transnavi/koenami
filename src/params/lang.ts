import type { ParamMatcher } from '@sveltejs/kit';

// The languages the studio serves as pages; the catalog decides which one loads.
export const match: ParamMatcher = (param) => ['ja', 'zh-CN', 'en', 'ko'].includes(param);
