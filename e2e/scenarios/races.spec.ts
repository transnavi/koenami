import { test, type Page } from '../fixtures';
import { app } from '../hooks';

// Requests that are superseded before they answer: a held response is released only
// after a newer action has taken over, so the stale result must be dropped.
function holdOnce(page: Page, pattern: string) {
	let release: (() => void) | null = null;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const installed = page.route(
		pattern,
		async (route) => {
			await held;
			await route.continue();
		},
		{ times: 1 }
	);
	return { installed, release: () => release!() };
}

test.describe('superseded requests', () => {
	test('a reference selected while an earlier detail is still loading', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		const first = holdOnce(page, '**/api/detail/common_voice_ja_36363165');
		await first.installed;
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selectedId('common_voice_ja_36363165'));
		await page.locator('.sample-row[data-id="common_voice_ja_36363168"]').click();
		await studio.until(app.selected('common_voice_ja_36363168'));
		first.release();
		await studio.until('!document.getElementById("reference-player").paused');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(600);
		await studio.golden('stale-detail-dropped');
	});

	test('a range reset while its analysis is still running, and words for a side that changed', async ({
		page,
		studio
	}) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(300);
		const range = holdOnce(page, '**/api/analyze');
		await range.installed;
		const box = (await page.locator('#signal-canvas').boundingBox())!;
		await page.mouse.move(box.x + 200, box.y + 80);
		await page.mouse.down();
		await page.mouse.move(box.x + 500, box.y + 80, { steps: 4 });
		await page.mouse.up();
		await studio.until(app.range('own'));
		await page.locator('#range-reset').click();
		await studio.until(app.noRange('own'));
		range.release();
		await studio.until(app.idle);
		await studio.tick(600);
		await studio.golden('stale-range-dropped');

		const words = holdOnce(page, '**/api/words**');
		await words.installed;
		await page.locator('#words-button').click();
		await studio.tick(100);
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownName('own-b.wav') + ' && ' + app.analysed);
		words.release();
		await studio.until('!document.getElementById("words-button").disabled');
		await studio.tick(600);
		await studio.golden('stale-words-dropped');
	});

	test('an imported clip replaced before its audio is decoded', async ({ page, studio }, info) => {
		// Two imported clips: the first selection is superseded while its stored audio is read.
		const { ZipWriter, BlobWriter, BlobReader } = await import('@zip.js/zip.js/index-native.js');
		const { readFileSync, writeFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const index = JSON.parse(
			readFileSync(
				new URL('../../tests/fixtures/data/jvs-import-index.json', import.meta.url),
				'utf8'
			)
		) as { clips: { id: string; member: string; fixture: string }[] };
		const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
		for (const clip of index.clips)
			await writer.add(
				clip.member,
				new BlobReader(
					new Blob([
						readFileSync(new URL(`../../tests/fixtures/audio/jvs/${clip.fixture}`, import.meta.url))
					])
				)
			);
		const archive = join(info.outputPath(), 'jvs_ver1.zip');
		writeFileSync(archive, Buffer.from(await (await writer.close()).arrayBuffer()));
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				// Decoding of imported audio waits for a release, so a second selection can overtake it.
				const decode = AudioContext.prototype.decodeAudioData;
				const w = window as unknown as { __holdDecode?: boolean; __releaseDecode?: () => void };
				AudioContext.prototype.decodeAudioData = async function (data: ArrayBuffer) {
					if (w.__holdDecode) {
						w.__holdDecode = false;
						await new Promise<void>((resolve) => {
							w.__releaseDecode = resolve;
						});
					}
					return decode.call(this, data);
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('#add-reference').click();
		await page.locator('#jvs-zip').setInputFiles(archive);
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await page.locator('#import-dialog [data-close]').click();
		await studio.choose('library-group', 'all');
		for (const speaker of ['jvs001', 'jvs002'])
			await page
				.locator(`#sample-list details.speaker-folder[data-speaker*="${speaker}"] summary`)
				.first()
				.click();
		await page.evaluate('window.__holdDecode = true');
		await page.locator(`.sample-row[data-id="${index.clips[0].id}"]`).click();
		await studio.until('typeof window.__releaseDecode === "function"');
		await page.locator(`.sample-row[data-id="${index.clips[2].id}"]`).click();
		await studio.until(app.selected(index.clips[2].id));
		await page.evaluate('window.__releaseDecode()');
		await studio.until('!document.getElementById("reference-player").paused');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(600);
		await studio.golden('stale-import-decode-dropped');
	});
});

test.describe('live tracks the analyzer could return', () => {
	test('sparse, gapped, flat and empty measurements', async ({ page, studio }) => {
		// The recorded three-second live response is reshaped on the way to the app.
		let shape = 'sparse';
		await page.route('**/api/analyze?live=1', async (route) => {
			const response = await route.fetch();
			const detail = await response.json();
			const rows = detail.track as { t: number }[];
			if (shape === 'sparse') detail.track = rows.filter((_, i) => i % 12 === 0);
			else if (shape === 'gapped') detail.track = rows.filter((r) => r.t < 0.8 || r.t > 1.6);
			// Every frame measures the same voice: the shape collapses to a point.
			else if (shape === 'flat') {
				const base = rows.find((r) => Object.values(r).every((v) => typeof v === 'number'))!;
				detail.track = rows.map((r) => ({ ...base, t: r.t }));
			} else if (shape === 'empty') detail.track = [];
			await route.fulfill({ response, json: detail });
		});
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#live-mode').click();
		await studio.until(app.recording);
		await studio.until(app.buffered(3.3));
		await studio.tick(500);
		await studio.until(app.liveMeasured);
		await studio.tick(1000);
		await studio.golden('live-sparse', {
			maskAudio: true,
			ignore: [
				'indicators',
				'fit-value',
				'report-button',
				'quality-state',
				'live-mode',
				'live-time'
			]
		});
		shape = 'gapped';
		await studio.tick(1500);
		await studio.golden('live-gapped', {
			maskAudio: true,
			ignore: [
				'indicators',
				'fit-value',
				'report-button',
				'quality-state',
				'live-mode',
				'live-time'
			]
		});
		shape = 'flat';
		await studio.tick(1500);
		await studio.golden('live-flat', {
			maskAudio: true,
			ignore: [
				'indicators',
				'fit-value',
				'report-button',
				'quality-state',
				'live-mode',
				'live-time'
			]
		});
		shape = 'empty';
		await studio.tick(6000);
		await studio.golden('live-empty', {
			maskAudio: true,
			ignore: [
				'indicators',
				'fit-value',
				'report-button',
				'quality-state',
				'live-mode',
				'live-time'
			]
		});
		await page.keyboard.press('r');
		await studio.until(app.stopped + ' && ' + app.idle);
	});
});
