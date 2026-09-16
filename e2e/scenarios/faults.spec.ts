import { test } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const idle = '!window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0';

test.describe('server and storage faults', () => {
	test('catalog and library failures', async ({ page, studio }) => {
		await page.route('**/api/catalog', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'catalog down' }));
		await studio.open('/ja/');
		await studio.tick(600);
		await studio.golden('catalog-500');
		await page.unroute('**/api/catalog');
		await page.route('**/api/library?lang=ko', (route) => route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'Not found' }));
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.choose('language', 'ko');
		await studio.until('!window.voiceApp.state.loadingLanguage');
		await studio.tick(300);
		await studio.golden('library-404-keeps-current');
	});

	test('analysis failures for uploads: 413, 429, 422 and a network error', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		const statuses: [number, string][] = [[413, '1分以内の音声を選んでください。'], [429, '少し待ってからお試しください。'], [422, '音声を解析できませんでした。']];
		for (const [status, body] of statuses) {
			await page.route('**/api/analyze', (route) => route.fulfill({ status, contentType: 'text/plain; charset=utf-8', body }), { times: 1 });
			await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
			await studio.until(idle);
			await studio.tick(300);
			await studio.golden(`analyze-${status}`);
			await studio.tick(5000);
		}
		await page.route('**/api/analyze', (route) => route.abort('connectionfailed'), { times: 1 });
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('analyze-network-error');
		await page.route('**/api/detail/**', (route) => route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: '解析サーバーを準備しています。' }), { times: 1 });
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until('window.voiceApp.state.selected?.id === "common_voice_ja_36363165"');
		await studio.until(idle);
		await studio.tick(600);
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(100);
		await studio.golden('detail-503');
	});

	test('storage that cannot open', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			// A microtask, since timers are under the test clock.
			const open = () => { const r: Record<string, unknown> = {}; Promise.resolve().then(() => { r.error = new DOMException('blocked', 'InvalidStateError'); (r.onerror as () => void)?.(); }); return r; };
			Object.defineProperty(window, 'indexedDB', { value: { open, databases: async () => [] } });
		}));
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('indexeddb-blocked');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(idle);
		await studio.tick(1200);
		await studio.golden('upload-without-storage');
	});

	test('a quota that overflows while saving a take', async ({ page, studio }) => {
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
				if (typeof key === 'string' && key.startsWith('recording:')) throw new DOMException('quota', 'QuotaExceededError');
				return put.call(this, value, key);
			};
		}));
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(idle);
		await studio.tick(1200);
		await studio.golden('quota-exceeded');
	});
});
