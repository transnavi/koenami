import { test, expect, type Page } from '../fixtures';
import { app } from '../hooks';

// A two-second cap keeps takes short. Manual stops happen between 1.4 s and 1.7 s of
// capture, so their sample count always rounds to the 1.5 s fixture bucket of the mock
// API; the cap itself trims automatic stops to exactly two seconds.
const shortCap = async (page: Page) =>
	page.route('**/api/catalog', async (route: import('@playwright/test').Route) => {
		const response = await route.fetch();
		const catalog = await response.json();
		catalog.capabilities.maxSeconds = 2;
		await route.fulfill({ response, json: catalog });
	});
const manualStop = 1.4;
const audio = { maskAudio: true } as const;
// Live readouts summarise the pitch track over a time window measured in captured
// samples, so their numbers shift with real capture timing.
const live = {
	maskAudio: true,
	ignore: ['indicators', 'fit-value', 'report-button', 'quality-state', 'live-mode', 'live-time']
} as const;

test.describe('recording', () => {
	test('record with R, stop, analyse in the background, and the take menu', async ({
		page,
		studio
	}) => {
		// The first analysis is held back so the saved-but-unanalysed state can be observed.
		let release: (() => void) | null = null;
		await page.route(
			'**/api/analyze',
			async (route) => {
				if (!release)
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				await route.continue();
			},
			{ times: 1 }
		);
		await studio.open('/ja/', shortCap);
		await studio.until(app.ready);
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await studio.tick(300);
		await studio.golden('recording', audio);
		await studio.until(app.buffered(manualStop));
		await page.keyboard.press('r');
		await studio.until(app.stopped + ' && ' + app.ownSamples + ' && ' + app.oneAnalysing);
		await studio.tick(100);
		await studio.golden('stopped', audio);
		release!();
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('analysed', audio);
		await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '録音 1');

		// A second take while the first is still saved, then cancel a third with Escape.
		await page.locator('#record').click();
		await studio.until(app.recording);
		await studio.until(app.buffered(manualStop));
		await page.locator('#record').click();
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('second-take', audio);
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await studio.tick(300);
		await page.keyboard.press('Escape');
		await studio.until(app.stopped + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('cancelled-restores-previous', audio);
		await page.locator('#take-select button.trigger').click();
		await studio.tick(100);
		await studio.golden('take-menu-open', audio);
		await page.keyboard.press('Escape');
		await studio.choose('take-select', '1');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('restored-first-take', audio);
	});

	test('a recording stopped within a quarter second is refused', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await page.keyboard.press('r');
		await studio.until(app.stopped + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('too-short-restores-previous', audio);
		// Leaving the page while recording releases the microphone (the harness navigation
		// does not raise beforeunload on its own, so it is dispatched first).
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('left-while-recording', audio);
	});

	test('the recording cap stops capture on its own', async ({ page, studio }) => {
		await studio.open('/ja/', shortCap);
		await studio.until(app.ready);
		await page.locator('#record').click();
		await studio.until(app.recording);
		await studio.until(app.stopped + ' && ' + app.ownSamples, 20_000);
		await studio.until(app.idle);
		await studio.tick(600);
		await studio.golden('auto-stopped', audio);
	});

	test('a failed analysis keeps the take and offers a retry', async ({ page, studio }) => {
		let fail = true;
		await page.route('**/api/analyze', async (route) => {
			if (fail)
				return route.fulfill({
					status: 503,
					contentType: 'text/plain; charset=utf-8',
					body: '解析サーバーを準備しています。'
				});
			return route.continue();
		});
		await studio.open('/ja/', shortCap);
		await studio.until(app.ready);
		await page.locator('#record').click();
		await studio.until(app.recording);
		await studio.until(app.buffered(manualStop));
		await page.locator('#record').click();
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('analysis-failed', audio);
		fail = false;
		await studio.choose('take-select', 'retry');
		await studio.until('!' + app.analysisPending + ' && ' + app.idle);
		await studio.tick(600);
		await studio.golden('retried', audio);
	});

	test('live measurement with loopback and the shape window', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#live-mode').click();
		await studio.until(app.recording);
		// The first measurement tick arrives before half a second of audio exists.
		await studio.tick(500);
		await studio.golden('live-started', live);
		await page.locator('#loopback').click();
		await studio.tick(100);
		await studio.golden('loopback-on', {
			...live,
			extra: { monitoring: await page.evaluate(app.monitoring) }
		});
		await page.locator('#loopback').click();
		await studio.until(app.buffered(3.3));
		await studio.tick(500);
		await studio.until(app.liveMeasured);
		await studio.tick(200);
		await studio.golden('live-measured', live);
		await page.locator('#settings-button').click();
		await page.locator('#live-shape-window').fill('2');
		await page.locator('#settings-dialog [data-close]').click();
		await studio.tick(500);
		await studio.golden('live-shape-window', live);
		// Measurements that stop arriving leave the live head to fade out.
		await page.route('**/api/analyze?live=1', (route) =>
			route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'busy' })
		);
		await studio.tick(4000);
		await studio.golden('live-silent', live);
		// Measurements that resume after a gap draw the trail with a pause.
		await page.unroute('**/api/analyze?live=1');
		await studio.tick(1000);
		await studio.golden('live-resumed-after-gap', live);
		await page.keyboard.press('r');
		await studio.until(app.stopped + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('live-stopped', live);
		await page.unroute('**/api/analyze?live=1');
		await page.locator('#live-mode').click();
		await studio.until(app.recording);
		await studio.until(app.buffered(3.3));
		await studio.tick(600);
		await studio.golden('live-restarted', live);
		// A measurement still in flight when live mode stops is discarded, and the buffer
		// is trimmed once more than twelve seconds have been captured.
		let release: (() => void) | null = null;
		await page.route(
			'**/api/analyze?live=1',
			async (route) => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				await route.continue();
			},
			{ times: 1 }
		);
		// The live buffer is trimmed to about twelve seconds, so it never reads more.
		await studio.until(app.buffered(12), 40_000);
		await page.waitForTimeout(1500);
		await studio.tick(500);
		await page.locator('#live-mode').click();
		await studio.until(app.stopped + ' && ' + app.idle);
		release!();
		await studio.tick(300);
		await studio.golden('live-stopped-with-request-in-flight', live);
		await page.locator('#live-mode').click();
		await studio.until(app.recording);
		await studio.tick(200);
		await page.locator('#live-mode').click();
		await studio.until(app.stopped + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('live-toggled-off', live);
	});

	test('microphone refused', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				navigator.mediaDevices.getUserMedia = () =>
					Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
			})
		);
		await studio.until(app.ready);
		await page.locator('#record').click();
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('mic-denied');
	});

	test('no media devices at all', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				Object.defineProperty(navigator, 'mediaDevices', { value: undefined });
			})
		);
		await studio.until(app.ready);
		await page.locator('#live-mode').click();
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('no-media-devices');
	});

	test('a worklet that fails to load', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				const original = AudioWorklet.prototype.addModule;
				AudioWorklet.prototype.addModule = function () {
					void original;
					return Promise.reject(new Error('worklet unavailable'));
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('#record').click();
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('worklet-failed');
	});
});
