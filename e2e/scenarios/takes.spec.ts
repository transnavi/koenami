import { test } from '../fixtures';
import { app } from '../hooks';

// The recording history's rows: a waveform that plays the take, replay from the row, and
// renaming a row in place from the pencil beside its name.
test.describe('recording history rows', () => {
	// The waveform is the play control: it clicks to play, gains a `playing` class while its
	// take plays, and shows the stop glyph then.
	const wave = (value: string) => `#take-select .wave[data-value="${value}"]`;
	const playing = (value: string, on: boolean) =>
		`document.getElementById('take-select').shadowRoot.querySelector('.wave[data-value="${value}"]').classList.contains('playing') === ${on}`;

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
		await page.locator(wave('1')).click();
		await studio.until(playing('1', true));
		await studio.tick(300);
		await studio.golden('row-replaying');
		// The same row again stops it; another row switches to that take.
		await page.locator(wave('1')).click();
		await studio.until(playing('1', false));
		await studio.tick(100);
		await studio.golden('row-replay-stopped');
		await page.locator(wave('1')).click();
		await studio.until(playing('1', true));
		await page.locator(wave('0')).click();
		await studio.until(playing('0', true) + ' && ' + playing('1', false));
		await studio.tick(100);
		await studio.golden('row-replay-switched');
		// Left alone, a replay ends on its own and the waveform returns to play.
		await studio.untilTicking(playing('0', false), 20_000);
		await studio.tick(100);
		await studio.golden('row-replay-ended');
		await page.locator(wave('1')).click();
		await studio.until(playing('1', true));
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

	test('renaming a take in place: an empty name, a commit, another take, Escape, a vanished take', async ({
		page,
		studio
	}) => {
		const menu = '#take-select';
		const selectedName = `${menu} .item[aria-checked="true"]`;
		const renameInput = `${menu} input.rename`;
		const openMenu = async () => {
			await page.locator(`${menu} button.trigger`).click();
			await studio.tick(100);
		};
		// The pencil beside the selected row's name opens the edit; it shows on hover.
		const editSelected = async () => {
			await page.locator(selectedName).hover();
			await page.locator(`${selectedName} + .row-action[data-action="rename"]`).click();
			await page.locator(renameInput).waitFor();
		};
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await studio.tick(300);
		// The selected row's name selects it like any other (the menu closes, nothing edits);
		// the pencil beside it is what renames.
		await openMenu();
		await page.locator(selectedName).click();
		await page.locator(`${menu} button.trigger[aria-expanded="false"]`).waitFor();
		await studio.tick(100);
		await studio.golden('name-click-selects');
		await openMenu();
		await page.locator(selectedName).hover();
		await studio.tick(100);
		await studio.golden('rename-pencil-on-hover');
		await editSelected();
		await studio.tick(100);
		await studio.golden('rename-editing');
		// A blank name commits nothing; the row keeps its name.
		await page.locator(renameInput).fill('   ');
		await page.keyboard.press('Enter');
		await studio.until(app.ownName('own-b.wav'));
		await studio.tick(100);
		await studio.golden('rename-empty-refused');
		// A real name is saved on Enter.
		await editSelected();
		await page.locator(renameInput).fill('朝の声');
		await page.keyboard.press('Enter');
		await studio.until(app.ownName('朝の声') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('renamed-current');
		// Clicking away from the input commits it (focus leaves the row).
		await editSelected();
		await page.locator(renameInput).fill('昼の声');
		await page.locator('#take-select button.trigger').click();
		await studio.until(app.ownName('昼の声') + ' && ' + app.idle);
		await studio.tick(200);
		await studio.golden('rename-committed-on-blur');
		// Escape leaves the name unchanged.
		await editSelected();
		await page.locator(renameInput).fill('捨てる');
		await page.keyboard.press('Escape');
		await studio.until(app.ownName('昼の声'));
		await studio.tick(100);
		await studio.golden('rename-cancelled');
		// Any row renames, not only the selected one: the other take (the previous one, which
		// the menu shows from its own snapshot) takes the new name in the list at once.
		await openMenu();
		await page.locator(`${menu} .item[data-value="1"]`).hover();
		await page.locator(`${menu} .row-action[data-value="1"][data-action="rename"]`).click();
		await page.locator(renameInput).fill('昨日の声');
		await page.keyboard.press('Enter');
		await studio.until(
			`document.getElementById('take-select').options[1].textContent === '昨日の声' && ` + app.idle
		);
		await studio.tick(300);
		await studio.golden('renamed-other-row');
		// Selecting that take makes it current under its new name; its name edits again.
		await page.locator(`${menu} .item[data-value="1"]`).click();
		await studio.until(app.ownName('昨日の声') + ' && ' + app.idle);
		await openMenu();
		await editSelected();
		await page.locator(renameInput).fill('一昨日の声');
		await page.keyboard.press('Enter');
		await studio.until(app.ownName('一昨日の声') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('renamed-second');
		// A take whose stored recording is gone cannot be renamed: the update finds no
		// snapshot, so the name rolls back and an error shows. The selected take's own
		// recording is removed behind the app's back.
		const storedId = await page.evaluate(() => {
			const s = (
				window as unknown as { voiceApp: { state: { ownTakeId?: string; ownId?: string } } }
			).voiceApp.state;
			return s.ownTakeId || s.ownId;
		});
		await page.evaluate(
			(id) =>
				new Promise<void>((resolve) => {
					const open = indexedDB.open('koe-takes');
					open.onsuccess = () => {
						const tx = open.result.transaction('session', 'readwrite');
						tx.objectStore('session').delete('recording:' + id);
						tx.oncomplete = () => resolve();
					};
				}),
			storedId
		);
		await openMenu();
		await editSelected();
		await page.locator(renameInput).fill('消えた声');
		await page.keyboard.press('Enter');
		await studio.until(
			`document.getElementById("notice").textContent === ${JSON.stringify('名前を変更できませんでした。もう一度お試しください。')}`
		);
		await studio.tick(300);
		await studio.golden('rename-vanished');
		// A take that is neither current nor previous is restored from its stored snapshot,
		// which must carry the new name too: a third upload pushes 昼の声 out of both slots.
		await page.keyboard.press('Escape');
		await page.locator(`${menu} button.trigger[aria-expanded="false"]`).waitFor();
		await page.locator('#upload').setInputFiles(studio.audio('microphone.wav'));
		await studio.until(app.ownName('microphone.wav') + ' && ' + app.analysed);
		await studio.tick(300);
		await openMenu();
		const older = `${menu} .choice-row[aria-label="昼の声"]`;
		await page.locator(`${older} .item`).hover();
		await page.locator(`${older} .row-action[data-action="rename"]`).click();
		await page.locator(renameInput).fill('夕方の声');
		await page.keyboard.press('Enter');
		await studio.until(
			`!!document.getElementById('take-select').shadowRoot.querySelector('.choice-row[aria-label="夕方の声"]')`
		);
		await page.locator(`${menu} .choice-row[aria-label="夕方の声"] .item`).click();
		await studio.until(app.ownName('夕方の声') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('renamed-stored-restored');
	});
});
