import { test } from '../fixtures';
import { app } from '../hooks';

test.describe('bulk actions on saved recordings', () => {
	test('nothing to bundle or delete on an empty history', async ({ page, studio }) => {
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
	});

	test('download every take as one zip, then delete them all', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
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
		// The zip writer is loaded on first use (the only script the click fetches, in either
		// tree); while it loads, a second download and a delete are both ignored as busy.
		let release!: () => void;
		const held = new Promise<void>((resolve) => { release = resolve; });
		let intercepted!: () => void;
		const paused = new Promise<void>((resolve) => { intercepted = resolve; });
		await page.route('**/*.js', async (route) => { intercepted(); await held; await route.continue(); }, { times: 1 });
		const zip = studio.download(async () => {
			await page.locator('#download-all').click();
			await paused;
			await page.locator('#download-all').click();
			await page.locator('#delete-all').click();
			release();
		});
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
