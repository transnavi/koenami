import { test, expect } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.busy';
const selected = (id: string) => `window.voiceApp.state.selected?.id === ${JSON.stringify(id)} && !!window.voiceApp.state.refFull`;

test.describe('sample library', () => {
	test('groups, sort, search and folders', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(200);

		await studio.choose('library-group', 'male');
		await studio.tick(200);
		await studio.golden('group-male');
		await studio.choose('library-group', 'androgynous');
		await studio.tick(200);
		await studio.golden('group-androgynous');
		await studio.choose('library-group', 'all');
		await studio.tick(200);
		await studio.golden('group-all');

		for (const sort of ['name', 'low', 'high']) {
			await studio.choose('sort', sort);
			await studio.tick(200);
			await studio.golden(`sort-${sort}`);
		}
		// The nearest-first order needs the user's own voice, so it stays disabled here.
		await expect(page.locator('#sort option[value=near]')).toBeDisabled();

		// Keyboard inside the popover: End then Enter picks the last enabled option.
		await page.locator('#sort button.trigger').click();
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await studio.tick(200);
		await studio.golden('sort-keyboard');
		await page.locator('#sort button.trigger').click();
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Escape');
		await studio.tick(200);
		await studio.golden('sort-escaped');
		await page.locator('#sort button.trigger').click();
		await page.mouse.click(2, 2);
		await studio.tick(200);
		await studio.golden('sort-light-dismiss');
		// Opening from the keyboard: ArrowUp focuses the last option, Space the current
		// one; a typed character jumps to the next option starting with it, wrapping round.
		await page.locator('#sort button.trigger').focus();
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('Enter');
		await studio.tick(200);
		await studio.golden('sort-arrow-up-open');
		await page.keyboard.press(' ');
		await page.keyboard.press('Escape');
		await studio.tick(100);
		// Type-ahead needs option labels in the typed script: the language list has English.
		await page.locator('#language button.trigger').focus();
		await page.keyboard.press('Enter');
		await page.keyboard.press('e');
		await page.keyboard.press('e');
		await page.keyboard.press('x');
		await page.keyboard.press('Escape');
		await studio.tick(200);
		await studio.golden('sort-type-ahead');
		// A second trigger click closes an open list.
		await page.locator('#sort button.trigger').click();
		await page.locator('#sort button.trigger').click();
		await studio.tick(200);
		await studio.golden('sort-toggle-closed');

		for (const query of ['F 2624', 'F2624', '26', 'nothing here', '']) {
			await page.fill('#search', query);
			await studio.tick(400);
			await studio.golden(`search-${query || 'empty'}`);
		}

		const folder = page.locator('#sample-list details.speaker-folder').nth(1);
		await folder.locator('summary').click();
		await studio.tick(100);
		await studio.golden('folder-opened');
		await folder.locator('summary').click();
		await studio.tick(100);
		await studio.golden('folder-closed');
	});

	test('load more: speaker folders beyond thirty, and rows beyond thirty inside a folder', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.choose('library-group', 'all');
		await studio.tick(200);
		await expect(page.locator('#load-more')).toBeVisible();
		await studio.golden('load-more-available');
		await page.locator('#load-more').click();
		await studio.tick(200);
		await studio.golden('load-more-clicked');
		// Folders fill lazily; open them until one shows its もっと見る row.
		const folders = page.locator('#sample-list details.speaker-folder');
		for (let i = 0; i < await folders.count(); i++) {
			const folder = folders.nth(i);
			if (await folder.getAttribute('open') === null) await folder.locator('summary').click();
			if (await folder.locator('.speaker-more').count()) break;
		}
		const big = folders.filter({ has: page.locator('.speaker-more') }).first();
		await studio.tick(100);
		await studio.golden('big-folder-open');
		await big.locator('.speaker-more').click();
		await studio.tick(100);
		await studio.golden('big-folder-more');
	});

	test('selecting, playing, seeking and favouriting a reference', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(200);

		// A click selects and starts playback of the reference; pause before observing, since
		// the playhead follows real audio time.
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(selected('common_voice_ja_36363165'));
		await studio.until('!document.getElementById("reference-player").paused');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('selected');
		await studio.canvas('selected-map', '#voice-map');
		await studio.canvas('selected-profile', '#profile-canvas');
		await page.locator('#reference-seek').fill('0');
		await studio.until('document.getElementById("reference-player").currentTime === 0');
		await studio.tick(100);
		await studio.canvas('selected-signal', '#signal-canvas');

		await page.locator('#play-reference').click();
		await studio.until('!document.getElementById("reference-player").paused');
		await studio.tick(600);
		await studio.golden('reference-playing');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(100);
		await studio.golden('reference-paused');
		await page.locator('#reference-seek').fill('50');
		await studio.until('(() => { const r = document.getElementById("reference-player"); return Math.abs(r.currentTime - r.duration / 2) < 0.05; })()');
		await studio.tick(100);
		await expect(page.locator('#reference-seek')).toHaveValue('50');
		await expect(page.locator('#reference-time')).toHaveText('0:05');
		await studio.golden('reference-seeked');

		await page.locator('#favorite-selected').click();
		await studio.tick(100);
		await studio.golden('favourited');
		await studio.choose('library-group', 'favorites');
		await studio.tick(200);
		await studio.golden('favourites-group');
		await page.locator('#sample-list .favorite[aria-pressed=true]').first().click();
		await studio.tick(200);
		await studio.golden('unfavourited-from-list');
		await studio.choose('library-group', 'female');
		await studio.tick(200);

		await page.locator('.sample-row[data-id="common_voice_ja_36363162"]').click();
		await studio.until(selected('common_voice_ja_36363162'));
		await studio.tick(200);
		await studio.golden('reselected-first');
		await expect(page.locator('#source-link')).toHaveAttribute('href', /huggingface/);

		// A synthetic VOICEVOX clip has a different source and no analysis audio locally.
		await studio.choose('library-group', 'all');
		await page.fill('#search', 'VOICEVOX');
		await studio.tick(300);
		await page.locator('#sample-list details.speaker-folder[data-speaker*="voicevox"] summary').first().click();
		await page.locator('#sample-list details.speaker-folder[data-speaker*="voicevox"] .sample-row').first().click();
		await studio.until('window.voiceApp.state.selected.synthetic === true && !window.voiceApp.state.busy');
		await studio.tick(300);
		await studio.golden('synthetic-selected');
	});

	test('reference uploaded from a file', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#add-reference').click();
		await studio.tick(100);
		await studio.golden('import-dialog');
		// 音声ファイルを選ぶ closes the dialog and opens the file picker.
		await page.locator('#import-audio').click();
		await studio.tick(100);
		await studio.golden('import-audio-chosen');
		await page.locator('#reference-upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until('window.voiceApp.state.selected?.group === "custom" && !window.voiceApp.state.busy');
		await studio.tick(300);
		await studio.golden('custom-reference');
		await studio.canvas('custom-reference-signal', '#signal-canvas');
		await studio.choose('library-group', 'custom');
		await studio.tick(200);
		await studio.golden('custom-group');
		// A range on a custom reference is analysed from its own samples.
		const box = (await page.locator('#signal-canvas').boundingBox())!;
		await page.mouse.move(box.x + 200, box.y + 80);
		await page.mouse.down();
		await page.mouse.move(box.x + 500, box.y + 80, { steps: 4 });
		await page.mouse.up();
		await studio.until('!!window.voiceApp.state.ranges.ref && !window.voiceApp.state.busy');
		await studio.tick(300);
		await studio.golden('custom-range');
		await page.locator('#words-button').click();
		await studio.until('!!window.voiceApp.state.words.ref');
		await studio.tick(300);
		await studio.golden('custom-words');
	});
});
