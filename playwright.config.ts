import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

// Routine checks use focused behavior assertions on the production build. Historical
// migration comparisons and V8 coverage each require an explicit opt-in.
const characterization = process.env.E2E_CHARACTERIZATION === '1';
const coverage = process.env.E2E_COVERAGE === '1';
const root = fileURLToPath(new URL('.', import.meta.url));
const mic = `${root}tests/fixtures/audio/microphone.wav`;
// A port beside the default dev server (8766), so a developer's session survives a test run.
const port = Number(process.env.E2E_PORT || 8776);
const site = process.env.E2E_STATIC || '.svelte-kit/cloudflare';
const marker = join(site, 'BUILD');
const build = existsSync(marker) ? readFileSync(marker, 'utf8') : '';
const expectedBuild = coverage ? 'coverage' : 'minified';
if (build !== expectedBuild)
	throw new Error(
		`${site} is a ${build || 'missing or stale'} build; run \`bun run ${coverage ? 'build:coverage' : 'build'}\` first`
	);

export default defineConfig({
	testDir: characterization ? 'e2e/scenarios' : 'e2e/flows',
	globalSetup: './e2e/global-setup.ts',
	outputDir: characterization ? 'test-output/characterization' : 'test-output/e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: characterization ? 90_000 : 45_000,
	reporter: process.env.CI ? 'github' : 'list',
	snapshotPathTemplate: 'tests/golden/canvas/{testFilePath}/{arg}{ext}',
	expect: { toMatchSnapshot: { maxDiffPixels: 0, threshold: 0 }, timeout: 15_000 },
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		channel: 'chromium',
		headless: true,
		viewport: { width: 1440, height: 960 },
		deviceScaleFactor: 1,
		locale: 'ja-JP',
		timezoneId: 'Asia/Tokyo',
		colorScheme: 'light',
		reducedMotion: 'reduce',
		permissions: ['microphone'],
		acceptDownloads: true,
		launchOptions: {
			args: [
				'--use-fake-device-for-media-stream',
				'--use-fake-ui-for-media-stream',
				`--use-file-for-fake-audio-capture=${mic}`,
				'--autoplay-policy=no-user-gesture-required',
				'--font-render-hinting=none',
				'--disable-lcd-text',
				'--force-device-scale-factor=1',
				'--disable-gpu',
				// Block coverage counters are dropped when V8 optimises a hot function; without
				// the optimiser every early return stays visible in the report.
				...(coverage ? ['--js-flags=--no-opt'] : [])
			]
		}
	},
	// One process, owned by Playwright, serves the site, the recorded API and the sample
	// audio. MOCK_API_RECORD (set by test:characterization:record) makes it proxy API
	// calls to a real analyzer and save the answers.
	webServer: {
		// E2E_SERVER_COMMAND starts the same server under another argv, for a machine where
		// a sibling worktree's suite stops servers by name.
		command: process.env.E2E_SERVER_COMMAND || 'node tests/mock-api/server.mjs',
		port,
		reuseExistingServer: false,
		env: {
			MOCK_API_PORT: String(port),
			MOCK_API_STATIC: site,
			...(process.env.MOCK_API_RECORD ? { MOCK_API_RECORD: process.env.MOCK_API_RECORD } : {})
		},
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
