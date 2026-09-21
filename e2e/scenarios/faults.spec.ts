import { test } from '../fixtures';
import { app } from '../hooks';

test.describe('server and storage faults', () => {
	test('catalog and library failures', async ({ page, studio }) => {
		await page.route('**/api/catalog', (route) =>
			route.fulfill({ status: 500, contentType: 'text/plain', body: '' })
		);
		await studio.open('/ja/');
		await studio.tick(600);
		await studio.golden('catalog-500');
		await page.unroute('**/api/catalog');
		// The public catalog has no research library, so the language list lacks the lab entry.
		await page.route('**/api/catalog', async (route) => {
			const response = await route.fetch();
			const catalog = await response.json();
			catalog.languages = catalog.languages.filter((l: { id: string }) => l.id !== 'lab');
			await route.fulfill({ response, json: catalog });
		});
		// Each language is its own page; when the page's library cannot be fetched the studio
		// reports it and stays empty.
		await page.route('**/api/library?lang=ko', (route) =>
			route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' })
		);
		await studio.open('/ko/');
		await studio.until('document.getElementById("notice").textContent.length > 0');
		await studio.tick(300);
		await studio.golden('library-404');
		await page.unroute('**/api/library?lang=ko');
		await studio.open('/ja/');
		await studio.until(app.ready);
		// Reference audio that cannot be fetched reports a playback error.
		await page.route('**/samples/common_voice_ja_36363165.mp3', (route) =>
			route.fulfill({ status: 404, body: '' })
		);
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selected('common_voice_ja_36363165'));
		await studio.until('document.getElementById("reference-player").error !== null');
		await studio.tick(300);
		await studio.golden('reference-audio-missing');
	});

	test('analysis failures for uploads: 413, 429, 422 and a network error', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		const statuses: [number, string][] = [
			[413, '1分以内の音声を選んでください。'],
			[429, '少し待ってからお試しください。'],
			[422, '音声を解析できませんでした。']
		];
		for (const [status, body] of statuses) {
			await page.route(
				'**/api/analyze',
				(route) => route.fulfill({ status, contentType: 'text/plain; charset=utf-8', body }),
				{ times: 1 }
			);
			await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
			await studio.until(app.idle);
			await studio.tick(300);
			await studio.golden(`analyze-${status}`);
			await studio.tick(5000);
		}
		await page.route('**/api/analyze', (route) => route.abort('connectionfailed'), { times: 1 });
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('analyze-network-error');
		await page.route(
			'**/api/detail/**',
			(route) =>
				route.fulfill({
					status: 503,
					contentType: 'text/plain; charset=utf-8',
					body: '解析サーバーを準備しています。'
				}),
			{ times: 1 }
		);
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selectedId('common_voice_ja_36363165'));
		await studio.until(app.idle);
		await studio.until('!document.getElementById("reference-player").paused');
		await studio.tick(600);
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(100);
		// The failed analysis and the interrupted playback both post a notice; their order
		// depends on which promise settles first.
		await studio.golden('detail-503', { ignore: ['notice', 'live-status', 'live-alert'] });
	});

	test('analysis responses without visuals or tracks still render', async ({ page, studio }) => {
		await page.route('**/api/analyze', async (route) => {
			const response = await route.fetch();
			const detail = await response.json();
			delete detail.visuals;
			delete detail.track;
			delete detail.features.f0;
			await route.fulfill({ response, json: detail });
		});
		await page.route('**/api/detail/**', async (route) => {
			const response = await route.fetch();
			const detail = await response.json();
			detail.visuals = {};
			await route.fulfill({ response, json: detail });
		});
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		for (const view of ['pitch', 'spectrogram', 'spectrum', 'waveform']) {
			await studio.choose('signal-view', view);
			await studio.tick(200);
			await studio.golden(`bare-${view}`);
		}
		await page.locator('#report-button').click();
		await studio.tick(100);
		await studio.golden('bare-report');
		await page.locator('#report-dialog [data-close]').click();
		await page.locator('#play-mine').click();
		await studio.until('!document.getElementById("player").paused');
		await studio.until('document.getElementById("player").currentTime > 1');
		await studio.tick(200);
		await page.keyboard.press('Space');
		await studio.until('document.getElementById("player").paused');
		await studio.tick(200);
		await studio.golden('bare-playback');
	});

	test('playback that fails and a delete that fails', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				const play = HTMLMediaElement.prototype.play;
				HTMLMediaElement.prototype.play = function () {
					return (window as unknown as { __failPlay?: boolean }).__failPlay
						? Promise.reject(new DOMException('blocked', 'NotAllowedError'))
						: play.call(this);
				};
				const del = IDBObjectStore.prototype.delete;
				IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
					if ((window as unknown as { __failDelete?: boolean }).__failDelete)
						throw new DOMException('gone', 'InvalidStateError');
					return del.call(this, key);
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		await page.evaluate('window.__failPlay = true');
		await page.locator('#play-mine').click();
		await studio.tick(300);
		await studio.golden('own-play-failed');
		await page.locator('#compare-ab').click();
		await studio.tick(300);
		await studio.golden('ab-play-failed');
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selected('common_voice_ja_36363165'));
		await studio.tick(300);
		await studio.golden('reference-play-failed');
		await page.evaluate('window.__failPlay = false; window.__failDelete = true');
		await studio.rowAction('take-select', '0', 'delete');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('delete-failed');
	});

	test('an interrupted A/B start-up cancels instead of skipping ahead', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				const play = HTMLMediaElement.prototype.play;
				HTMLMediaElement.prototype.play = function () {
					return (window as unknown as { __abortPlay?: boolean }).__abortPlay
						? Promise.reject(new DOMException('interrupted', 'AbortError'))
						: play.call(this);
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selected('common_voice_ja_36363165'));
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		// The reference's play() is cut short the moment A/B starts, so the comparison cancels
		// rather than carrying on into the own phase, and nothing is reported.
		await page.evaluate('window.__abortPlay = true');
		await page.locator('#compare-ab').click();
		await studio.until(
			'document.getElementById("compare-ab").getAttribute("aria-pressed") === "false"'
		);
		await studio.tick(300);
		await studio.golden('ab-start-interrupted');
	});

	test('storage that cannot open', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				// A microtask, since timers are under the test clock.
				const open = () => {
					const r: Record<string, unknown> = {};
					void Promise.resolve().then(() => {
						r.error = new DOMException('blocked', 'InvalidStateError');
						(r.onerror as () => void)?.();
					});
					return r;
				};
				Object.defineProperty(window, 'indexedDB', { value: { open, databases: async () => [] } });
			})
		);
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('indexeddb-blocked');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('upload-without-storage');
	});

	test('a quota that overflows while saving a take', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				const put = IDBObjectStore.prototype.put;
				IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
					if (typeof key === 'string' && key.startsWith('recording:'))
						throw new DOMException('quota', 'QuotaExceededError');
					return put.call(this, value, key);
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('quota-exceeded');
	});
});
