import { test, expect, type Page } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const idle = '!window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0';
const recording = 'window.voiceApp.state.recording === true';
const buffered = (seconds: number) => `window.voiceApp.captureDebug().bufferSeconds >= ${seconds}`;

// A two-second cap keeps takes short. Manual stops happen between 1.4 s and 1.7 s of
// capture, so their sample count always rounds to the 1.5 s fixture bucket of the mock
// API; the cap itself trims automatic stops to exactly two seconds.
const shortCap = async (page: Page) => page.route('**/api/catalog', async (route) => {
	const response = await route.fetch();
	const catalog = await response.json();
	catalog.capabilities.maxSeconds = 2;
	await route.fulfill({ response, json: catalog });
});
const manualStop = 1.4;
const audio = { maskAudio: true } as const;
// Live readouts summarise the pitch track over a time window measured in captured
// samples, so their numbers shift with real capture timing.
const live = { maskAudio: true, ignore: ['indicators', 'fit-value', 'report-button', 'quality-state'] } as const;

test.describe('recording', () => {
	test('record with R, stop, analyse in the background, and the take menu', async ({ page, studio }) => {
		await studio.open('/ja/', shortCap);
		await studio.until(ready);
		await page.keyboard.press('r');
		await studio.until(recording);
		await studio.tick(300);
		await studio.golden('recording', audio);
		await studio.until(buffered(manualStop));
		await page.keyboard.press('r');
		await studio.until('window.voiceApp.state.recording === false && !!window.voiceApp.state.ownPCM');
		await studio.tick(100);
		await studio.golden('stopped', audio);
		await studio.until(idle);
		await studio.tick(1200);
		await studio.golden('analysed', audio);
		await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '録音 1');

		// A second take while the first is still saved, then cancel a third with Escape.
		await page.locator('#record').click();
		await studio.until(recording);
		await studio.until(buffered(manualStop));
		await page.locator('#record').click();
		await studio.until(idle);
		await studio.tick(1200);
		await studio.golden('second-take', audio);
		await page.keyboard.press('r');
		await studio.until(recording);
		await studio.tick(300);
		await page.keyboard.press('Escape');
		await studio.until('window.voiceApp.state.recording === false && ' + idle);
		await studio.tick(300);
		await studio.golden('cancelled-restores-previous', audio);
		await page.locator('#take-select button.trigger').click();
		await studio.tick(100);
		await studio.golden('take-menu-open', audio);
		await page.keyboard.press('Escape');
		await studio.choose('take-select', '1');
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('restored-first-take', audio);
	});

	test('the recording cap stops capture on its own', async ({ page, studio }) => {
		await studio.open('/ja/', shortCap);
		await studio.until(ready);
		await page.locator('#record').click();
		await studio.until(recording);
		await studio.until('window.voiceApp.state.recording === false && !!window.voiceApp.state.ownPCM', 20_000);
		await studio.until(idle);
		await studio.tick(600);
		await studio.golden('auto-stopped', audio);
	});

	test('a failed analysis keeps the take and offers a retry', async ({ page, studio }) => {
		let fail = true;
		await page.route('**/api/analyze', async (route) => {
			if (fail) return route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: '解析サーバーを準備しています。' });
			return route.continue();
		});
		await studio.open('/ja/', shortCap);
		await studio.until(ready);
		await page.locator('#record').click();
		await studio.until(recording);
		await studio.until(buffered(manualStop));
		await page.locator('#record').click();
		await studio.until(idle);
		await studio.tick(1200);
		await studio.golden('analysis-failed', audio);
		fail = false;
		await studio.choose('take-select', 'retry');
		await studio.until('!window.voiceApp.state.ownFull?.analysisPending && ' + idle);
		await studio.tick(600);
		await studio.golden('retried', audio);
	});

	test('live measurement with loopback and the shape window', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#live-mode').click();
		await studio.until(recording);
		await studio.tick(200);
		await studio.golden('live-started', live);
		await page.locator('#loopback').click();
		await studio.tick(100);
		await studio.golden('loopback-on', { ...live, extra: { monitoring: await page.evaluate('window.voiceApp.captureDebug().monitoring') } });
		await page.locator('#loopback').click();
		await studio.until(buffered(3.3));
		await studio.tick(500);
		await studio.until('window.voiceApp.state.liveTrack.length > 0');
		await studio.tick(200);
		await studio.golden('live-measured', live);
		await page.locator('#settings-button').click();
		await page.locator('#live-shape-window').fill('2');
		await page.locator('#settings-dialog [data-close]').click();
		await studio.tick(500);
		await studio.golden('live-shape-window', live);
		await page.keyboard.press('r');
		await studio.until('window.voiceApp.state.recording === false && ' + idle);
		await studio.tick(300);
		await studio.golden('live-stopped', live);
		await page.locator('#live-mode').click();
		await studio.until(recording);
		await page.locator('#live-mode').click();
		await studio.until('window.voiceApp.state.recording === false && ' + idle);
		await studio.tick(300);
		await studio.golden('live-toggled-off', live);
	});

	test('microphone refused, no media devices, and a worklet that fails to load', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
		}));
		await studio.until(ready);
		await page.locator('#record').click();
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('mic-denied');
		await studio.open('/ja/', async (p) => p.addInitScript(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined }); }));
		await studio.until(ready);
		await page.locator('#live-mode').click();
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('no-media-devices');
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			const original = AudioWorklet.prototype.addModule;
			AudioWorklet.prototype.addModule = function () { void original; return Promise.reject(new Error('worklet unavailable')); };
		}));
		await studio.until(ready);
		await page.locator('#record').click();
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('worklet-failed');
	});
});
