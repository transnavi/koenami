import { defineCustomClientStrategy } from '$lib/paraglide/runtime';

// In the browser the page's language is the one its document was rendered in. The path
// usually says the same, but the Worker serves /r?l=en from the English result page at an
// unprefixed address, so the document is the one source that is always right.
defineCustomClientStrategy('custom-document', {
	getLocale: () => document.documentElement.lang || undefined,
	setLocale: () => {}
});
