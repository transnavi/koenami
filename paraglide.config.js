// How the messages compile, shared by the Vite plugin (build and dev) and scripts/i18n.mjs (the
// type checks and unit tests, which run without Vite). A page is in the language its path
// names, and in the browser the language its document was rendered in (src/hooks.client.ts).
// The result page (/r, /<lang>/r) also takes one from ?l= (src/hooks.server.ts); without `url`
// in its list, /r?l=en is never redirected to a prefixed address.
/** @type {import('@inlang/paraglide-js').CompilerOptions} */
export default {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	strategy: ['custom-document', 'url', 'baseLocale'],
	routeStrategies: [{ match: '/r', strategy: ['custom-document', 'custom-result', 'baseLocale'] }]
};
