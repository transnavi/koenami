import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js/index-native.js';

import { test, expect } from '../fixtures';
import { app } from '../hooks';

// The index fixture names three archive members backed by generated tones; the archive
// and folder are rebuilt from them on every run.
const index = JSON.parse(
	readFileSync(new URL('../../tests/fixtures/data/jvs-import-index.json', import.meta.url), 'utf8')
) as { clips: { id: string; member: string; fixture: string }[] };
const tone = (name: string) =>
	readFileSync(new URL(`../../tests/fixtures/audio/jvs/${name}`, import.meta.url));

async function archive(dir: string, clips = index.clips, name = 'jvs_ver1.zip') {
	const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
	await writer.add('jvs_ver1/README.txt', new BlobReader(new Blob(['stand-in'])));
	for (const clip of clips)
		await writer.add(clip.member, new BlobReader(new Blob([tone(clip.fixture)])));
	const path = join(dir, name);
	writeFileSync(path, Buffer.from(await (await writer.close()).arrayBuffer()));
	return path;
}
function folder(dir: string, clips = index.clips) {
	for (const clip of clips) {
		const path = join(dir, clip.member);
		mkdirSync(join(path, '..'), { recursive: true });
		writeFileSync(path, tone(clip.fixture));
	}
	return join(dir, 'jvs_ver1');
}
const speakerOf = (id: string) => id.split('-')[0];

test.describe('JVS import', () => {
	test('dialog, zip import, playback and persistence', async ({ page, studio }, info) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(200);
		await expect(page.locator('#jvs-banner')).toHaveCount(0);
		await page.locator('#add-reference').click();
		await studio.tick(100);
		await studio.golden('dialog-from-add-reference');
		await page.locator('#choose-jvs-zip').click();
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('zip-imported');
		await page.locator('#import-dialog [data-close]').click();
		await studio.tick(100);
		await studio.choose('library-group', 'all');
		await studio.tick(200);
		await studio.golden('imported-in-library');
		const first = index.clips[0].id;
		await page
			.locator(`#sample-list details.speaker-folder[data-speaker*="${speakerOf(first)}"] summary`)
			.first()
			.click();
		await page.locator(`.sample-row[data-id="${first}"]`).click();
		await studio.until(app.selected(first));
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('imported-selected');
		await page.locator('#reference-seek').fill('0');
		await studio.until('document.getElementById("reference-player").currentTime === 0');
		await studio.tick(100);
		await studio.canvas('imported-signal', '#signal-canvas');
		await page.locator('#words-button').click();
		await studio.until(app.words('ref'));
		await studio.tick(200);
		await studio.golden('imported-words');
		const second = index.clips[1].id;
		await page.locator(`.sample-row[data-id="${second}"]`).click();
		await studio.until(app.selected(second));
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('second-imported-selected');
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('persisted-after-reload');
		await page.locator('#add-reference').click();
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('zip-again-adds-nothing');
	});

	test('folder import, a single speaker folder and an unrelated folder', async ({
		page,
		studio
	}, info) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#add-reference').click();
		await page.locator('#choose-jvs-folder').click();
		await page
			.locator('#jvs-folder')
			.setInputFiles(folder(join(info.outputPath(), 'one'), index.clips.slice(2)));
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('folder-one-speaker');
		await page.locator('#jvs-folder').setInputFiles(folder(join(info.outputPath(), 'all')));
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('folder-rest');
		const stray = join(info.outputPath(), 'stray');
		mkdirSync(stray, { recursive: true });
		writeFileSync(join(stray, 'notes.txt'), 'nothing');
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#add-reference').click();
		await page.locator('#jvs-folder').setInputFiles(stray);
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('folder-unrelated-already-complete');
	});

	test('errors: wrong bytes and an unrelated archive', async ({ page, studio }, info) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#add-reference').click();
		const wrong = { ...index.clips[0], fixture: 'clip2.wav' };
		await page
			.locator('#jvs-zip')
			.setInputFiles(await archive(info.outputPath(), [wrong], 'wrong.zip'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('digest-mismatch');
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath(), [], 'empty.zip'));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('unrelated-archive');
		// An imported clip whose stored audio has been lost.
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		await studio.until('document.getElementById("jvs-status").textContent.includes("追加済み")');
		await studio.until(app.idle);
		await page.locator('#import-dialog [data-close]').click();
		await page.evaluate(
			(id) =>
				new Promise<void>((resolve) => {
					const open = indexedDB.open('koe-takes');
					open.onsuccess = () => {
						const tx = open.result.transaction('session', 'readwrite');
						tx.objectStore('session').delete('jvs-audio:' + id);
						tx.oncomplete = () => resolve();
					};
				}),
			index.clips[0].id
		);
		await studio.choose('library-group', 'all');
		await page
			.locator(
				`#sample-list details.speaker-folder[data-speaker*="${speakerOf(index.clips[0].id)}"] summary`
			)
			.first()
			.click();
		await page.locator(`.sample-row[data-id="${index.clips[0].id}"]`).click();
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('imported-audio-missing');
	});

	test('cancel while the first digest is being computed', async ({ page, studio }, info) => {
		await studio.open('/ja/', async (p) =>
			p.addInitScript(() => {
				const original = crypto.subtle.digest.bind(crypto.subtle);
				(window as unknown as { __release?: () => void }).__release = undefined;
				crypto.subtle.digest = async (alg, data) => {
					await new Promise<void>((resolve) => {
						(window as unknown as { __release?: () => void }).__release = resolve;
					});
					return original(alg, data);
				};
			})
		);
		await studio.until(app.ready);
		await page.locator('#add-reference').click();
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		await studio.until('typeof window.__release === "function"');
		await studio.tick(100);
		await studio.golden('import-in-progress');
		await page.locator('#cancel-jvs').click();
		await page.evaluate('window.__release()');
		await studio.until('document.getElementById("cancel-jvs").hidden && ' + app.idle);
		await studio.tick(300);
		await studio.golden('cancelled');
	});

	test('an import while another language is shown', async ({ page, studio }, info) => {
		await studio.open('/en/');
		await studio.until(app.languageLoaded('en'));
		await page.locator('#add-reference').click();
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		// The English page reports in English.
		await studio.until('document.getElementById("jvs-status").textContent.includes("imported")');
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('imported-in-english');
	});

	test('index unavailable', async ({ page, studio }, info) => {
		await page.route('**/api/import-index/jvs', (route) =>
			route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' })
		);
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('index-unavailable-at-start');
		await page.locator('#add-reference').click();
		await page.locator('#jvs-zip').setInputFiles(await archive(info.outputPath()));
		await studio.until(app.idle);
		await studio.tick(300);
		await studio.golden('index-unavailable-on-import');
	});
});
