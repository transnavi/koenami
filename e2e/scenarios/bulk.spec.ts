import { test } from '../fixtures';
import { app } from '../hooks';

test.describe('bulk actions on saved recordings', () => {
	test('download every take as one zip, then delete them all', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#settings-button').click();
		await page.locator('#download-all').click();
		await studio.tick(100);
		await studio.golden('nothing-to-download');
		await page.locator('#delete-all').click();
		await studio.tick(100);
		await studio.golden('nothing-to-delete');
		await page.locator('#settings-dialog [data-close]').click();
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownNameStartsWith('own-b'));
		await studio.until(app.analysed);
		// A second take of the same name gets a numbered file in the zip.
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.ownNameStartsWith('own-a'));
		await studio.until(app.analysed);
		await studio.tick(1200);
		await page.locator('#settings-button').click();
		// The zip writer is loaded on first use; a second click while it loads is ignored.
		let release: (() => void) | null = null;
		await page.route('**/node_modules/@zip.js/zip.js/index-native.js', async (route) => { await new Promise<void>((resolve) => { release = resolve; }); await route.continue(); }, { times: 1 });
		const held = page.waitForRequest('**/node_modules/@zip.js/zip.js/index-native.js');
		const zip = studio.download(async () => { await page.locator('#download-all').click(); await held; await page.locator('#download-all').click(); await page.locator('#delete-all').click(); release!(); });
		await studio.golden('zip-downloaded', { extra: { zip: await zip } });
		await studio.until(app.idle);
		await studio.tick(100);
		await studio.golden('after-zip');
		// The confirmation is declined, then accepted.
		page.once('dialog', (dialog) => dialog.dismiss());
		await page.locator('#delete-all').click();
		await studio.tick(100);
		await studio.golden('delete-all-declined');
		page.once('dialog', (dialog) => dialog.accept());
		await page.locator('#delete-all').click();
		await studio.until('window.voiceApp.state.takes.every((t) => !t.stored)');
		await studio.tick(300);
		await studio.golden('all-deleted');
		await page.locator('#settings-dialog [data-close]').click();
	});
});
