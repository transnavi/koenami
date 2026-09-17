import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Characterization runs: one worker, no retries, everything pinned. RECORD=1 rewrites
// the goldens and, together with MOCK_API_RECORD on the mock server, the API fixtures.
const root = fileURLToPath(new URL('.', import.meta.url));
const mic = `${root}tests/fixtures/audio/microphone.wav`;
// A port beside the default dev server (8766), so a developer's session survives a test run.
const port = Number(process.env.E2E_PORT || 8776);
// Which tree the browser gets: the pinned vanilla files for `old` (extracted by the
// global setup), or the directory named by E2E_STATIC for the rewrite.
const tree = process.env.KOENAMI_TREE || 'old';
const site = tree === 'old' ? 'tests/old-tree/web' : process.env.E2E_STATIC;
if (!site) throw new Error('KOENAMI_TREE=new needs E2E_STATIC=<directory with the built site>');

export default defineConfig({
	testDir: 'e2e/scenarios',
	globalSetup: './e2e/global-setup.ts',
	outputDir: 'test-output/e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 90_000,
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
				'--js-flags=--no-opt'
			]
		}
	},
	// One process, owned by Playwright, serves the site, the recorded API and the sample
	// audio. MOCK_API_RECORD (set by tests/scripts/record-e2e.sh) makes it proxy API
	// calls to a real analyzer and save the answers.
	webServer: { command: 'node tests/mock-api/server.mjs', port, reuseExistingServer: false, env: { MOCK_API_PORT: String(port), MOCK_API_STATIC: site, ...(process.env.MOCK_API_RECORD ? { MOCK_API_RECORD: process.env.MOCK_API_RECORD } : {}) }, stdout: 'pipe', stderr: 'pipe' }
});
