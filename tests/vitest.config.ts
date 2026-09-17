import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// KOENAMI_TREE selects which implementation the characterization tests run against:
//   old  — the pinned vanilla modules extracted by tests/scripts/checkout-old.mjs
//   new  — the SvelteKit library under src/lib
const tree = process.env.KOENAMI_TREE || 'old';
const root = fileURLToPath(new URL('..', import.meta.url));
const app = tree === 'new' ? `${root}src/lib` : `${root}tests/old-tree/web`;

export default defineConfig({
	// The service worker is web/public/sw.js today and src/lib/service-worker.js in the Kit tree
	// (src/service-worker.js, Kit's entry, only imports it).
	resolve: { alias: tree === 'new' ? [{ find: '@app/public/sw', replacement: `${root}src/lib/service-worker.js` }, { find: '@app', replacement: app }] : { '@app': app } },
	test: {
		root,
		include: ['tests/unit/**/*.test.ts'],
		setupFiles: ['tests/unit/setup.ts'],
		globalSetup: ['tests/unit/global-setup.ts'],
		environment: 'node',
		coverage: {
			// Native V8 coverage through monocart, the same converter the browser layer uses,
			// so both layers merge as source ranges (see tests/coverage/report.mjs).
			provider: 'custom',
			customProviderModule: 'vitest-monocart-coverage',
			include: tree === 'new' ? ['src/lib/**/*.{ts,js,svelte}'] : ['tests/old-tree/web/**/*.js'],
			reportsDirectory: 'coverage/unit'
		}
	}
});
