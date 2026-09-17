import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The SvelteKit app. The current studio under web/ builds with vite.web.config.js until
// its routes move here.
// KOENAMI_COVERAGE=1 builds unminified with inline source maps so the browser
// coverage of the suite (tests/coverage/report.mjs) maps back to src/.
const coverage = Boolean(process.env.KOENAMI_COVERAGE);

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: coverage ? { sourcemap: 'inline', minify: false } : {},
	server: {
		host: '127.0.0.1',
		port: 8767,
		strictPort: true,
		proxy: {
			'/api': 'http://127.0.0.1:35511',
			'/samples': 'http://127.0.0.1:35511',
			'/data': 'http://127.0.0.1:35511'
		}
	}
});
