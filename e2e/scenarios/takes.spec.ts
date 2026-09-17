import { test, expect } from '../fixtures';
import { app } from '../hooks';

// The recording history's rows: a waveform preview per take, replay from the row, and
// renaming through a dialog.
test.describe('recording history rows', () => {
	const rowButton = (id: string, value: string, action: string) =>
		`#${id} button.row-action[data-value="${value}"][data-action="${action}"]`;
	// The replay button of a row reads 停止 while its take plays, 再生 otherwise.
	const replay = (value: string, title: '停止' | '再生') =>
		`document.getElementById('take-select').shadowRoot.querySelector('.row-action[data-action=play][data-value="${value}"]').title === ${JSON.stringify(title)}`;

	test('waveform previews, replay from a row, stop on a second click and on record', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await studio.tick(300);
		// The menu lists both takes with their waveform peaks.
		await page.locator('#take-select button.trigger').click();
		await studio.tick(300);
		await studio.golden('menu-with-previews');
		await page.locator(rowButton('take-select', '1', 'play')).click();
		await studio.until(replay('1', '停止'));
		await studio.tick(300);
		await studio.golden('row-replaying');
		// The same row again stops it; another row switches to that take.
		await page.locator(rowButton('take-select', '1', 'play')).click();
		await studio.until(replay('1', '再生'));
		await studio.tick(100);
		await studio.golden('row-replay-stopped');
		await page.locator(rowButton('take-select', '1', 'play')).click();
		await studio.until(replay('1', '停止'));
		await page.locator(rowButton('take-select', '0', 'play')).click();
		await studio.until(replay('0', '停止') + ' && ' + replay('1', '再生'));
		await studio.tick(100);
		await studio.golden('row-replay-switched');
		// Left alone, a replay ends on its own and the row's button returns to play.
		await studio.untilTicking(replay('0', '再生'), 20_000);
		await studio.tick(100);
		await studio.golden('row-replay-ended');
		await page.locator(rowButton('take-select', '1', 'play')).click();
		await studio.until(replay('1', '停止'));
		await page.keyboard.press('Escape');
		await page.locator('#take-select button.trigger[aria-expanded="false"]').waitFor();
		// Recording stops a replay so it cannot bleed into the take.
		await page.locator('#record').click();
		await studio.until(app.recording);
		await studio.tick(200);
		await page.locator('#take-select button.trigger').click({ force: true });
		await studio.tick(100);
		await studio.golden('replay-stopped-by-record');
		// The menu is disabled while recording, so the click above opened nothing; Escape
		// from the page cancels the capture.
		await page.locator('body').click({ position: { x: 1, y: 1 } });
		await page.keyboard.press('Escape');
		await studio.until(app.stopped + ' && ' + app.idle);
	});

	test('a take stored before the previews existed gets its waveform on the next visit', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(300);
		// The stored index entry loses its peaks behind the app's back, as one saved by an
		// earlier version has none.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					const open = indexedDB.open('koe-takes');
					open.onsuccess = () => {
						const tx = open.result.transaction('session', 'readwrite');
						const store = tx.objectStore('session');
						const read = store.get('recording-index');
						read.onsuccess = () => {
							const index = (read.result as { peaks?: unknown }[]).map(
								({ peaks: _peaks, ...t }) => t
							);
							store.put(index, 'recording-index');
						};
						tx.oncomplete = () => resolve();
					};
				})
		);
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.until('window.voiceApp.state.takes.every((t) => t.peaks)');
		await studio.tick(300);
		await studio.golden('peaks-backfilled');
	});

	test('renaming a take: the dialog, an empty name, the current take, a stored take, a take that vanished', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await studio.tick(300);
		await studio.rowAction('take-select', '0', 'rename');
		await studio.tick(100);
		await studio.golden('rename-dialog');
		await page.locator('#rename-input').fill('   ');
		await page.locator('#rename-save').click();
		await studio.tick(100);
		await studio.golden('rename-empty-refused');
		await page.locator('#rename-input').fill('朝の声');
		await page.keyboard.press('Enter');
		await studio.until(app.ownName('朝の声') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('renamed-current');
		// A stored take that is not the current one is renamed in the database.
		await studio.rowAction('take-select', '1', 'rename');
		await page.locator('#rename-input').fill('昨日の声');
		await page.locator('#rename-save').click();
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('renamed-stored');
		// Escape leaves the dialog without renaming.
		await studio.rowAction('take-select', '1', 'rename');
		await page.keyboard.press('Escape');
		await studio.tick(100);
		await studio.golden('rename-cancelled');
		// A take whose recording is gone cannot be renamed.
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					const open = indexedDB.open('koe-takes');
					open.onsuccess = () => {
						const tx = open.result.transaction('session', 'readwrite');
						tx.objectStore('session').delete('recording:00000000-0000-4000-8000-000000000001');
						tx.oncomplete = () => resolve();
					};
				})
		);
		await studio.rowAction('take-select', '1', 'rename');
		await page.locator('#rename-input').fill('消えた声');
		await page.locator('#rename-save').click();
		await studio.until('document.getElementById("notice").textContent.length > 0');
		await studio.tick(300);
		await studio.golden('rename-vanished');
		expect(
			await page.locator('#rename-dialog').evaluate((d) => (d as HTMLDialogElement).open)
		).toBe(false);
	});
});
