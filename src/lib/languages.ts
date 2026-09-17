/* The languages the studio serves as pages (/ja/, /zh-CN/, /en/, /ko/); the catalog decides
   which one a page loads. The result page accepts the same set in its links. */
export const LANGUAGES = ['ja', 'zh-CN', 'en', 'ko'] as const;
export type Language = (typeof LANGUAGES)[number];
