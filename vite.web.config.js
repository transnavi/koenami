import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig } from 'vite';

import { LANGUAGES, home, languageOf, renderPage, renderManifest } from './web/i18n/index.js';

// Each language is its own document. index.html and result.html are templates whose
// {{…}} tokens the catalogue fills (web/i18n): the dev server renders them per request
// from the URL (/en/, /r?l=en), and the build writes /index.html (Japanese, duplicated
// at /ja/), /<lang>/index.html, /result.html, /<lang>/result.html and each language's
// site.webmanifest, which worker.ts serves at those paths.
const PAGES = { 'index.html': (lang) => home(lang), 'result.html': () => '/r' };
function languagePages() {
	let publicDir;
	const manifest = () => readFileSync(join(publicDir, 'site.webmanifest'), 'utf8');
	return {
		name: 'koenami-language-pages',
		configResolved(config) {
			publicDir = config.publicDir;
		},
		transformIndexHtml: {
			order: 'pre',
			handler(html, ctx) {
				if (!ctx.server) return html;
				const name = ctx.path.split('/').pop() || 'index.html',
					lang = languageOf(ctx.originalUrl || ctx.path);
				if (!PAGES[name]) throw new Error(`koenami-language-pages: ${name} has no page address`);
				return renderPage(html, lang, PAGES[name](lang));
			}
		},
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				// The Worker serves /r from result.html; the language manifests exist only in the build.
				if (req.url === '/r' || req.url.startsWith('/r?')) {
					req.url = '/result.html' + req.url.slice(2);
					return next();
				}
				const m = /^\/(zh-CN|en|ko)\/site\.webmanifest$/.exec(req.url || '');
				if (!m) return next();
				res.setHeader('content-type', 'application/manifest+json');
				res.end(renderManifest(manifest(), m[1]));
				return undefined;
			});
		},
		// After Vite has rewritten the asset links, the templates become one document per language.
		enforce: 'post',
		generateBundle(options, bundle) {
			for (const [name, path] of Object.entries(PAGES)) {
				const asset = bundle[name];
				if (!asset || asset.type !== 'asset')
					throw new Error(`koenami-language-pages: ${name} is not in the bundle`);
				const template = String(asset.source);
				asset.source = renderPage(template, 'ja', path('ja'));
				for (const lang of LANGUAGES) {
					if (lang === 'ja' && name !== 'index.html') continue;
					this.emitFile({
						type: 'asset',
						fileName: `${lang}/${name}`,
						source: renderPage(template, lang, path(lang))
					});
				}
			}
			for (const lang of LANGUAGES)
				if (lang !== 'ja')
					this.emitFile({
						type: 'asset',
						fileName: `${lang}/site.webmanifest`,
						source: renderManifest(manifest(), lang)
					});
		}
	};
}
export default defineConfig({
	root: 'web',
	publicDir: 'public',
	plugins: [languagePages()],
	server: {
		host: '127.0.0.1',
		port: 8766,
		strictPort: true,
		forwardConsole: false,
		proxy: Object.fromEntries(
			['/api', '/samples', '/data'].map((path) => [
				path,
				{ target: `http://127.0.0.1:${process.env.KOENAMI_API_PORT || 35511}`, changeOrigin: false }
			])
		)
	},
	build: {
		assetsInlineLimit: 0,
		outDir: '../dist',
		emptyOutDir: true,
		rollupOptions: {
			input: {
				app: 'web/index.html',
				method: 'web/method.html',
				guide: 'web/guide.html',
				tutorial: 'web/tutorial.html',
				references: 'web/references.html',
				result: 'web/result.html',
				review: 'web/review.html',
				pairs: 'web/pairs.html'
			}
		}
	}
});
