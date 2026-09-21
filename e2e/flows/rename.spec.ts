import type { Page } from '@playwright/test';

import { app } from '../hooks';
import { test, expect } from './fixtures';

const row = (page: Page, name: string) =>
	page.locator(`#take-select .choice-row[aria-label=${JSON.stringify(name)}]`);

async function edit(page: Page, name: string) {
	const trigger = page.locator('#take-select button.trigger');
	if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
	await row(page, name).locator('.item').hover();
	await row(page, name).locator('[data-action="rename"]').click();
	return page.locator('#take-select input.rename');
}

test.beforeEach(async ({ page, studio }) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	for (const name of ['own-a.wav', 'own-b.wav']) {
		await page.locator('#upload').setInputFiles(studio.audio(name));
		await studio.until(app.ownName(name) + ' && ' + app.analysed);
	}
});

test('the pencil edits the selected take while its name selects it', async ({ page, studio }) => {
	await page.locator('#take-select button.trigger').click();
	await row(page, 'own-b.wav').locator('.item').click();
	await expect(page.locator('#take-select button.trigger')).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await expect(page.locator('#take-select input.rename')).toHaveCount(0);
	await expect
		.poll(() => page.evaluate('window.voiceApp.state.previousTake.name'))
		.toBe('own-a.wav');
	const input = await edit(page, 'own-b.wav');
	await input.fill('   ');
	await page.keyboard.press('Enter');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-b.wav');
	await expect(input).toHaveCount(0);
	await (await edit(page, 'own-b.wav')).fill('朝の練習');
	await page.keyboard.press('Enter');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '朝の練習');
	await (await edit(page, '朝の練習')).fill('取り消す名前');
	await page.keyboard.press('Escape');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '朝の練習');
	await (await edit(page, '朝の練習')).fill('昼の練習');
	await page.locator('#take-select button.trigger').click();
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '昼の練習');
	await studio.until(app.idle);
	await studio.open('/ja/');
	await studio.until(app.ready + ' && ' + app.analysed);
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '昼の練習');
});

test('previous and older takes keep renamed names when restored', async ({ page, studio }) => {
	await (await edit(page, 'own-a.wav')).fill('前の練習');
	await page.keyboard.press('Enter');
	await expect(row(page, '前の練習')).toBeVisible();
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-b.wav');
	await page.keyboard.press('Escape');
	await page.locator('#upload').setInputFiles(studio.audio('microphone.wav'));
	await studio.until(app.ownName('microphone.wav') + ' && ' + app.analysed);
	await (await edit(page, '前の練習')).fill('保存した練習');
	await page.keyboard.press('Enter');
	await expect(row(page, '保存した練習')).toBeVisible();
	await expect(page.locator('#take-select')).toHaveAttribute(
		'data-display-label',
		'microphone.wav'
	);
	await row(page, '保存した練習').locator('.item').click();
	await studio.until(app.ownName('保存した練習') + ' && ' + app.analysed);
	await studio.open('/ja/');
	await studio.until(app.ready + ' && ' + app.analysed);
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '保存した練習');
	await expect(page.locator('#play-mine')).toBeEnabled();
});

test('a recording missing from storage reports a failed rename without changing its name', async ({
	page
}) => {
	const id = await page.evaluate<string>('window.voiceApp.state.ownTakeId');
	expect(id).toBeTruthy();
	await page.evaluate(
		(id) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('koe-takes');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction('session', 'readwrite');
					tx.objectStore('session').delete('recording:' + id);
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onabort = () => {
						db.close();
						reject(tx.error);
					};
				};
			}),
		id
	);
	await (await edit(page, 'own-b.wav')).fill('保存できない名前');
	await page.keyboard.press('Enter');
	await expect(page.locator('#notice')).toContainText('名前を変更できませんでした');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-b.wav');
	await expect(row(page, 'own-b.wav')).toBeVisible();
});
