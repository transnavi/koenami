import { test, expect, type Page } from '../fixtures';
import { app } from '../hooks';
import { readFileSync } from 'node:fs';


// Holds the next analysis until released, so the busy state can be observed.
async function hold(page: Page) {
	let release: (() => void) | null = null;
	const held = new Promise<void>((resolve) => { release = resolve; });
	await page.route('**/api/analyze', async (route) => { await held; await route.continue(); }, { times: 1 });
	return () => release!();
}

test.describe('busy and recording guards', () => {
	test('controls ignore input while an upload is being analysed', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		const release = await hold(page);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.busy);
		await studio.tick(100);
		await studio.golden('busy');
		// Buttons are disabled while busy; shortcuts, file inputs and the canvases still
		// deliver events, which the handlers ignore.
		await page.locator('#language button.trigger').click({ force: true });
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click({ force: true });
		await page.keyboard.press('r');
		await page.keyboard.press('Space');
		await page.keyboard.press('Escape');
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await page.locator('#reference-upload').setInputFiles(studio.audio('own-b.wav'));
		await page.locator('#signal-canvas').click({ position: { x: 300, y: 60 } });
		await page.locator('#voice-map').click({ position: { x: 400, y: 300 } });
		await studio.tick(200);
		await studio.golden('still-busy-nothing-changed');
		release();
		await studio.until(app.analysed);
		await studio.tick(300);
		await studio.golden('released');
	});

	test('controls ignore input while recording, and a take chosen mid-recording cancels it', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await page.locator('#language button.trigger').click({ force: true });
		await page.keyboard.press('Space');
		await page.locator('#signal-canvas').click({ position: { x: 300, y: 60 } });
		await page.locator('#signal-canvas').focus();
		await page.keyboard.press('ArrowRight');
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await page.locator('#jvs-zip').setInputFiles([]);
		// Orbiting the map while recording keeps that view afterwards.
		const map = (await page.locator('#voice-map').boundingBox())!;
		await page.mouse.move(map.x + 400, map.y + 300);
		await page.mouse.down();
		await page.mouse.move(map.x + 480, map.y + 320, { steps: 4 });
		await page.mouse.up();
		await studio.tick(200);
		await studio.golden('recording-guards', { maskAudio: true });
		await studio.choose('take-select', '0');
		await studio.until(app.stopped + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('take-restored-cancels-recording', { maskAudio: true });
	});

	test('upload limits: longer than the cap, larger than 150 MB', async ({ page, studio }) => {
		await page.route('**/api/catalog', async (route) => {
			const response = await route.fetch();
			const catalog = await response.json();
			catalog.capabilities.maxSeconds = 2;
			await route.fulfill({ response, json: catalog });
		});
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!;
			Object.defineProperty(File.prototype, 'size', { get() { return this.name === 'huge.wav' ? 200 * 1024 * 1024 : size.get!.call(this); } });
		}));
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('too-long-for-cap');
		await page.locator('#upload').setInputFiles({ name: 'huge.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF') });
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('too-large');
	});

	test('a retry that cannot save the take, and favourites that cannot be stored', async ({ page, studio }) => {
		// A recording that cannot be stored is kept in memory with its analysis pending.
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			const put = IDBObjectStore.prototype.put;
			IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
				if (typeof key === 'string' && (key.startsWith('recording:') || key === 'references')) throw new DOMException('quota', 'QuotaExceededError');
				return put.call(this, value, key);
			};
		}));
		await studio.until(app.ready);
		await page.locator('#record').click();
		await studio.until(app.recording);
		await studio.until(app.buffered(1.4));
		await page.locator('#record').click();
		await studio.until(app.stopped + ' && ' + app.ownSamples);
		await studio.until(app.idle);
		await studio.tick(1200);
		await studio.golden('unsaved-take-after-failure', { maskAudio: true });
		// The unsaved take has no stored samples, so there is nothing to bundle.
		await page.locator('#settings-button').click();
		await page.locator('#download-all').click();
		await studio.tick(100);
		await studio.golden('download-all-with-unsaved-take', { maskAudio: true });
		await page.locator('#settings-dialog [data-close]').click();
		await studio.choose('take-select', 'retry');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('retry-cannot-save', { maskAudio: true });
		await page.locator('#reference-upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.selectedGroup('custom') + ' && ' + app.idle);
		await page.locator('#favorite-selected').click();
		await studio.tick(300);
		await studio.golden('favourite-cannot-store', { maskAudio: true });
	});

	test('a stored take whose recording is gone, and an imported clip whose audio is gone', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await page.locator('#upload').setInputFiles({ name: 'a<b>&"\'.wav', mimeType: 'audio/wav', buffer: readFileSync(studio.audio('own-a.wav')) });
		await studio.until(app.ownNameStartsWith('a<b>') + ' && ' + app.analysed);
		await studio.tick(300);
		await studio.golden('three-takes-escaped-name');
		// The oldest take is neither current nor previous, so it is read from storage; its
		// recording is removed behind the app's back first.
		await page.evaluate(() => new Promise<void>((resolve) => {
			const open = indexedDB.open('koe-takes');
			open.onsuccess = () => { const tx = open.result.transaction('session', 'readwrite'); tx.objectStore('session').delete('recording:00000000-0000-4000-8000-000000000001'); tx.oncomplete = () => resolve(); };
		}));
		await studio.choose('take-select', '2');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('take-unreadable');
		await studio.rowAction('take-select', '2', 'download');
		await studio.tick(300);
		await studio.golden('download-unreadable');
		await page.keyboard.press('Escape');
		// A stored take that is intact restores and downloads through storage.
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.analysed);
		await studio.choose('take-select', '2');
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('stored-take-restored');
		const wav = await studio.download(async () => {
			await studio.rowAction('take-select', '2', 'download');
		});
		await studio.golden('stored-take-downloaded', { extra: { wav } });
		await page.keyboard.press('Escape');
		await page.locator('#take-select button.trigger[aria-expanded="false"]').waitFor();
		// A history point on the map restores its take.
		await page.locator('[data-dimension="2"]').click();
		await studio.tick(300);
		const xy = (await page.evaluate(app.historyHit)) as [number, number] | null;
		const box = (await page.locator('#voice-map').boundingBox())!;
		await page.mouse.click(box.x + xy![0], box.y + xy![1]);
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('history-point-restored');
		// Deleting the current take falls back to the previous one; with no previous take
		// left, the newest stored take is applied instead.
		await studio.rowAction('take-select', '0', 'delete');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('current-deleted-previous-applied');
		await studio.rowAction('take-select', '1', 'delete');
		await studio.until(app.idle);
		await studio.rowAction('take-select', '0', 'delete');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('current-deleted-stored-applied');
	});
});
