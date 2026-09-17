import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// The SvelteKit app. The current studio under web/ builds with vite.web.config.js until
// its routes move here.
export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
