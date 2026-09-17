// A page of its own at a file-like address; prerendered as one file. The per-result title
// and preview tags that worker.ts writes into result.html from the query string stay a
// worker concern: the Kit worker entry wraps this page's response in the same rewriter
// when it takes over serving, so the static file the suite loads is the unrewritten shell.
export const prerender = true;
export const trailingSlash = 'never';
