import { test, expect } from '../fixtures';
import { app } from '../hooks';


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
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(1200);
		await studio.golden('uploaded');
		await studio.canvas('uploaded-map', '#voice-map');
		await studio.canvas('uploaded-profile', '#profile-canvas');
		await studio.canvas('uploaded-signal-pitch', '#signal-canvas');

		await page.locator('#report-button').click();
		await studio.tick(100);
		await studio.golden('report-open');
		await page.locator('#report-dialog [data-close]').click();
		// With a masculine reference the report names the other group.
		await studio.choose('library-group', 'male');
		await page.locator('#sample-list details.speaker-folder summary').first().click();
		await page.locator('#sample-list .sample-row').first().click();
		await studio.until(app.selectedGroup('male') + ' && ' + app.referenceLoaded);
		await studio.until('!document.getElementById("reference-player").paused');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await page.locator('#report-button').click();
		await studio.tick(100);
		await studio.golden('report-male-reference');
		await page.locator('#report-dialog [data-close]').click();
		await page.locator('#reference-seek').fill('0');
		await studio.until('document.getElementById("reference-player").currentTime === 0');
		await page.locator('#report-button').click();
		await studio.tick(100);
		const report = await studio.download(() => page.locator('#report-save').click());
		await studio.golden('report-saved', { extra: { report } });
		await page.locator('#report-dialog [data-close]').click();

		for (const metric of ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']) {
			await page.locator(`#indicators [data-metric="${metric}"]`).click();
			await studio.tick(100);
			await studio.golden(`metric-${metric}`);
			await page.locator('#metric-dialog [data-close]').click();
		}
		// A focused indicator keeps focus when the panel is rebuilt.
		await page.locator('#indicators [data-metric="hnr"]').focus();
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await studio.tick(300);
		await studio.golden('indicator-focus-kept');

		for (const [i, view] of ['spectrogram', 'spectrum', 'waveform', 'spectrogram', 'pitch'].entries()) {
			await studio.choose('signal-view', view);
			await studio.tick(300);
			await studio.golden(`view-${i}-${view}`);
			await studio.canvas(`signal-${i}-${view}`, '#signal-canvas');
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
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(300);

		// Shift+arrow without a selection starts one from the first second.
		await page.locator('#signal-canvas').focus();
		await page.keyboard.press('Shift+ArrowRight');
		await studio.until(app.rangeApplied('own'));
		await studio.settled();
		await studio.tick(300);
		await studio.golden('own-range-from-keyboard');
		await page.locator('#range-reset').click();
		await studio.until(app.noRange('own'));
		// A frame drawn mid-drag shows the pending selection.
		const box = (await page.locator('#signal-canvas').boundingBox())!;
		await page.mouse.move(box.x + 200, box.y + 80);
		await page.mouse.down();
		await page.mouse.move(box.x + 350, box.y + 80, { steps: 3 });
		await studio.tick(100);
		await studio.canvas('own-drag-pending', '#signal-canvas');
		await page.mouse.move(box.x + 500, box.y + 80, { steps: 3 });
		await page.mouse.up();
		await studio.until(app.rangeApplied('own'));
		await studio.settled();
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
		await studio.until(app.rangeApplied('own'));
		await studio.settled();
		await studio.tick(300);
		await studio.golden('own-range-grown');
		await page.keyboard.press('Shift+ArrowLeft');
		await studio.until(app.rangeApplied('own'));
		await studio.settled();
		await studio.tick(300);
		await studio.golden('own-range-shrunk');
		await page.locator('#range-reset').click();
		await studio.until(app.noRange('own'));
		await studio.tick(300);
		await studio.golden('own-range-reset');
		// A selection whose analysis fails is reported.
		await page.route('**/api/analyze', (route) => route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: '解析サーバーを準備しています。' }), { times: 1 });
		await dragSignal(page, 200, 500);
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('own-range-analysis-failed');

		// Timeline drags select on the full duration; a too-narrow drag is ignored.
		await dragSignal(page, 100, 400, 6);
		await studio.until(app.rangeApplied('own'));
		await studio.settled();
		await studio.tick(300);
		await studio.golden('own-timeline-range');
		await page.locator('#signal-ref').click();
		await dragSignal(page, 150, 450);
		await studio.until(app.rangeApplied('ref'));
		await studio.settled();
		await studio.tick(300);
		await studio.golden('ref-range');
		await dragSignal(page, 100, 110);
		await studio.tick(300);
		await studio.golden('ref-range-too-short-ignored');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Escape');
		await studio.until(app.noRanges);
		await studio.tick(300);
		await studio.golden('ranges-cleared-by-escape');
	});

	test('words for own and reference audio', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#words-button').click();
		await studio.until(app.words('own'));
		await studio.tick(300);
		await studio.golden('own-words');
		await page.locator('#report-button').click();
		await studio.tick(100);
		await studio.golden('report-with-pace');
		await page.locator('#report-dialog [data-close]').click();
		await page.locator('#word-list button').nth(1).click();
		await studio.tick(100);
		await studio.golden('own-word-seek');
		await page.locator('#signal-ref').click();
		await page.locator('#words-button').click();
		await studio.until(app.words('ref'));
		await studio.tick(300);
		await studio.golden('ref-words');
		await page.locator('#word-list button').nth(1).click();
		await studio.tick(100);
		await studio.golden('ref-word-seek');
		await page.locator('#words-button').click();
		await studio.tick(100);
		await studio.golden('ref-words-again');
		await page.route('**/api/words**', (route) => route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'Word timing is unavailable.' }));
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await page.locator('#signal-own').click();
		await page.locator('#words-button').click();
		await studio.until('!document.getElementById("words-button").disabled');
		await studio.tick(300);
		await studio.golden('words-unavailable');
	});

	test('playback: own, A/B, speed and normalisation', async ({ page, studio }) => {
		test.slow();
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#play-mine').click();
		await studio.until('!document.getElementById("player").paused');
		await studio.tick(300);
		await studio.golden('own-playing');
		// Frames after the first voiced second draw the playback cursor and trail.
		await studio.until('document.getElementById("player").currentTime > 2.5');
		await studio.tick(200);
		await page.locator('[data-dimension="2"]').click();
		await studio.tick(200);
		await page.locator('[data-dimension="3"]').click();
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
		// A full comparison: the reference phase hands over to the own phase and ends.
		await page.locator('#compare-ab').click();
		await studio.untilTicking('!document.getElementById("player").paused');
		await studio.untilTicking('document.getElementById("player").paused && document.getElementById("reference-player").paused');
		await studio.tick(5000);
		await studio.golden('ab-complete');
		// Reference playback with a range stops at the range end.
		await page.locator('#signal-ref').click();
		const box = (await page.locator('#signal-canvas').boundingBox())!;
		await page.mouse.move(box.x + 100, box.y + 80);
		await page.mouse.down();
		await page.mouse.move(box.x + 220, box.y + 80, { steps: 4 });
		await page.mouse.up();
		await studio.until(app.rangeApplied('ref'));
		await studio.settled();
		await page.locator('#play-reference').click();
		await studio.untilTicking('document.getElementById("reference-player").paused');
		await studio.tick(5000);
		await studio.golden('range-playback-ended');
		await page.locator('#play-reference').click();
		await studio.untilTicking('document.getElementById("reference-player").paused');
		await studio.tick(5000);
		await studio.golden('range-playback-restarted-from-start');
	});

	test('takes: second upload, history, download, restore and delete', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		await studio.tick(1200);
		await studio.golden('two-takes');
		// The current take comes back after a reload.
		await studio.open('/ja/');
		await studio.until(app.analysed);
		await studio.tick(300);
		await studio.golden('reloaded-with-take');
		await studio.choose('sort', 'near');
		await studio.tick(300);
		await studio.golden('sorted-near');
		const wav = await studio.download(async () => {
			await studio.rowAction('take-select', '1', 'download');
		});
		await studio.golden('downloaded-previous', { extra: { wav } });
		await page.keyboard.press('Escape');
		await studio.choose('take-select', '1');
		await studio.until(app.ownName('own-a.wav') + ' && ' + app.idle);
		await studio.tick(300);
		await studio.golden('restored-first');
		await studio.rowAction('take-select', '1', 'delete');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('deleted-other');
		await studio.rowAction('take-select', '0', 'delete');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('deleted-current');
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('after-reload');
	});

	test('rejected uploads: too short, undecodable, empty selection', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('too-short.wav'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('too-short');
		await page.locator('#upload').setInputFiles(studio.audio('not-audio.wav'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('not-audio');
		await studio.tick(5000);
		await studio.golden('notice-gone');
		await page.locator('#upload').setInputFiles([]);
		await studio.tick(300);
		await studio.golden('no-file');
	});
});
