import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// The characterization tests run against the studio's library under src/lib; the service
// worker's `$service-worker` module and the Workers runtime's `cloudflare:workers` are stood in for.
const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			'@app': `${root}src/lib`,
			$lib: `${root}src/lib`,
			'$service-worker': `${root}tests/unit/service-worker-stub.ts`,
			'cloudflare:workers': `${root}tests/unit/cloudflare-workers-stub.ts`
		}
	},
	test: {
		root,
		// The container library imports `cloudflare:workers`, which only resolves through the alias.
		server: { deps: { inline: ['@cloudflare/containers'] } },
		include: ['tests/unit/**/*.test.{ts,js}'],
		setupFiles: ['tests/unit/setup.ts'],
		environment: 'node',
		coverage: {
			// Native V8 coverage through monocart, the same converter the browser layer uses,
			// so both layers merge as source ranges (see tests/coverage/report.mjs).
			provider: 'custom',
			customProviderModule: 'vitest-monocart-coverage',
			include: ['src/lib/**/*.{ts,js,svelte}', 'src/service-worker.ts'],
			reportsDirectory: 'coverage/unit'
		}
	}
});
