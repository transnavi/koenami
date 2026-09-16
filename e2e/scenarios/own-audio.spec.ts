import { test, expect } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const analysed = '!!window.voiceApp?.state.ownFull && !window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0';
const idle = '!window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0';

async function dragSignal(page: import('@playwright/test').Page, from: number, to: number, y = 80) {
	const box = (await page.locator('#signal-canvas').boundingBox())!;
	await page.mouse.move(box.x + from, box.y + y);
	await page.mouse.down();
	await page.mouse.move(box.x + (from + to) / 2, box.y + y, { steps: 3 });
	await page.mouse.move(box.x + to, box.y + y, { steps: 3 });
	await page.mouse.up();
}

test.describe('own audio', () => {
	test('upload, indicators, report, metric dialogs and signal views', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await studio.tick(1200);
		await studio.golden('uploaded');
		await studio.canvas('uploaded-map', '#voice-map');
		await studio.canvas('uploaded-profile', '#profile-canvas');
		await studio.canvas('uploaded-signal-pitch', '#signal-canvas');

		await page.locator('#report-button').click();
		await studio.tick(100);
		await studio.golden('report-open');
		const report = await studio.download(() => page.locator('#report-save').click());
		await studio.golden('report-saved', { extra: { report } });
		await page.locator('#report-dialog [data-close]').click();

		for (const metric of ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']) {
			await page.locator(`#indicators [data-metric="${metric}"]`).click();
			await studio.tick(100);
			await studio.golden(`metric-${metric}`);
			await page.locator('#metric-dialog [data-close]').click();
		}

		for (const view of ['spectrogram', 'spectrum', 'waveform', 'pitch']) {
			await studio.choose('signal-view', view);
			await studio.tick(300);
			await studio.golden(`view-${view}`);
			await studio.canvas(`signal-${view}`, '#signal-canvas');
		}
		await page.locator('#signal-ref').click();
		await studio.tick(200);
		await studio.golden('signal-ref');
		await studio.canvas('signal-ref-pitch', '#signal-canvas');
		await page.locator('#signal-overlay').uncheck();
		await studio.tick(200);
		await studio.golden('overlay-off');
		await studio.canvas('signal-ref-no-overlay', '#signal-canvas');
		await page.locator('#signal-overlay').check();
		await page.locator('#signal-own').click();
		await studio.tick(200);
		await studio.golden('signal-own-again');
	});

	test('ranges: drag, click seek, arrow keys, reset and escape', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await studio.tick(300);

		await dragSignal(page, 200, 500);
		await studio.until('!!window.voiceApp.state.ranges.own && ' + idle);
		await studio.tick(300);
		await studio.golden('own-range');
		await studio.canvas('own-range-signal', '#signal-canvas');
		// A short drag is a seek, not a selection.
		await dragSignal(page, 300, 302);
		await studio.tick(100);
		await studio.golden('own-seek-click');
		await page.locator('#signal-canvas').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowLeft');
		await studio.tick(100);
		await studio.golden('own-arrow-seek');
		await page.keyboard.press('Shift+ArrowRight');
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('own-range-grown');
		await page.keyboard.press('Shift+ArrowLeft');
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('own-range-shrunk');
		await page.locator('#range-reset').click();
		await studio.until('!window.voiceApp.state.ranges.own');
		await studio.tick(300);
		await studio.golden('own-range-reset');

		// Timeline drags select on the full duration; a too-narrow drag is ignored.
		await dragSignal(page, 100, 400, 6);
		await studio.until('!!window.voiceApp.state.ranges.own && ' + idle);
		await studio.tick(300);
		await studio.golden('own-timeline-range');
		await page.locator('#signal-ref').click();
		await dragSignal(page, 150, 450);
		await studio.until('!!window.voiceApp.state.ranges.ref && ' + idle);
		await studio.tick(300);
		await studio.golden('ref-range');
		await dragSignal(page, 100, 110);
		await studio.tick(300);
		await studio.golden('ref-range-too-short-ignored');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Escape');
		await studio.until('!window.voiceApp.state.ranges.own && !window.voiceApp.state.ranges.ref');
		await studio.tick(300);
		await studio.golden('ranges-cleared-by-escape');
	});

	test('words for own and reference audio', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await page.locator('#words-button').click();
		await studio.until('!!window.voiceApp.state.words.own');
		await studio.tick(300);
		await studio.golden('own-words');
		await page.locator('#word-list button').nth(1).click();
		await studio.tick(100);
		await studio.golden('own-word-seek');
		await page.locator('#signal-ref').click();
		await page.locator('#words-button').click();
		await studio.until('!!window.voiceApp.state.words.ref');
		await studio.tick(300);
		await studio.golden('ref-words');
		await page.locator('#words-button').click();
		await studio.tick(100);
		await studio.golden('ref-words-again');
	});

	test('playback: own, A/B, speed and normalisation', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await page.locator('#play-mine').click();
		await studio.until('!document.getElementById("player").paused');
		await studio.tick(300);
		await studio.golden('own-playing');
		await page.keyboard.press('Space');
		await studio.until('document.getElementById("player").paused');
		await studio.tick(100);
		await studio.golden('own-paused-by-space');
		await page.locator('#playback-speed').fill('0.75');
		await studio.tick(1200);
		await studio.golden('speed-slow');
		await page.locator('#speed-reset').click();
		await studio.tick(100);
		await studio.golden('speed-reset');
		await page.locator('#settings-button').click();
		await page.locator('#normalize').uncheck();
		await page.locator('#settings-dialog [data-close]').click();
		await page.locator('#compare-ab').click();
		await studio.until('!document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('ab-reference-phase');
		await page.locator('#compare-ab').click();
		await studio.until('document.getElementById("reference-player").paused && document.getElementById("player").paused');
		await studio.tick(100);
		await studio.golden('ab-cancelled');
	});

	test('takes: second upload, history, download, restore and delete', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until('window.voiceApp.state.ownName === "own-b.wav" && ' + analysed);
		await studio.tick(1200);
		await studio.golden('two-takes');
		await studio.choose('sort', 'near');
		await studio.tick(300);
		await studio.golden('sorted-near');
		const wav = await studio.download(async () => {
			await page.locator('#take-select button.trigger').click();
			await page.locator('#take-select button.row-action[data-value="1"][data-action="download"]').click();
		});
		await studio.golden('downloaded-previous', { extra: { wav } });
		await page.keyboard.press('Escape');
		await studio.choose('take-select', '1');
		await studio.until('window.voiceApp.state.ownName === "own-a.wav" && ' + idle);
		await studio.tick(300);
		await studio.golden('restored-first');
		await page.locator('#take-select button.trigger').click();
		await page.locator('#take-select button.row-action[data-value="1"][data-action="delete"]').click();
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('deleted-other');
		await page.locator('#take-select button.trigger').click();
		await page.locator('#take-select button.row-action[data-value="0"][data-action="delete"]').click();
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('deleted-current');
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('after-reload');
	});

	test('rejected uploads: too short, undecodable, empty selection', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('too-short.wav'));
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('too-short');
		await page.locator('#upload').setInputFiles(studio.audio('not-audio.wav'));
		await studio.until(idle);
		await studio.tick(300);
		await studio.golden('not-audio');
		await studio.tick(5000);
		await studio.golden('notice-gone');
		await page.locator('#upload').setInputFiles([]);
		await studio.tick(300);
		await studio.golden('no-file');
	});
});
