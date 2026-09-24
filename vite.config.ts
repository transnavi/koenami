import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The SvelteKit app; dev.mjs starts it next to the analyzer and proxies the API to it.
// KOENAMI_COVERAGE=1 builds unminified with inline source maps so the browser
// coverage of the suite (tests/coverage/report.mjs) maps back to src/.
const coverage = Boolean(process.env.KOENAMI_COVERAGE);

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		// Messages live in messages/<locale>.json. The locale is the page's path: / is Japanese,
		// /<locale>/ the others; /lab/ has no prefix of its own and reads as Japanese.
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['custom-document', 'url', 'baseLocale']
		})
	],
	build: coverage ? { sourcemap: 'inline', minify: false } : {},
	server: {
		host: '127.0.0.1',
		port: 8766,
		strictPort: true,
		proxy: {
			'/api': 'http://127.0.0.1:35511',
			'/samples': 'http://127.0.0.1:35511',
			'/data': 'http://127.0.0.1:35511'
		}
	}
});
