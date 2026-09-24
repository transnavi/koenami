import type { Page } from '@playwright/test';

import { app } from '../hooks';
import { test, expect } from './fixtures';

const control = (page: Page, order: string) =>
	page.locator(`#take-select [part~="header-button"][data-sort="${order}"]`);
const names = (page: Page) =>
	page
		.locator('#take-select .choice-row')
		.evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')));

test.beforeEach(async ({ page, studio }) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	for (const name of ['own-a.wav', 'own-b.wav', 'microphone.wav']) {
		await studio.tick(1000);
		await page.locator('#upload').setInputFiles(studio.audio(name));
		await studio.until(app.ownName(name) + ' && ' + app.analysed);
	}
	await page.locator('#take-select button.trigger').click();
});

test('all four history orders preserve selection and the chosen order survives reload', async ({
	page,
	studio
}) => {
	const orders = {
		newest: ['microphone.wav', 'own-b.wav', 'own-a.wav'],
		oldest: ['own-a.wav', 'own-b.wav', 'microphone.wav'],
		name: ['microphone.wav', 'own-a.wav', 'own-b.wav'],
		longest: ['microphone.wav', 'own-a.wav', 'own-b.wav']
	};
	for (const [order, expected] of Object.entries(orders)) {
		await control(page, order).click();
		await expect(control(page, order)).toHaveAttribute('aria-checked', 'true');
		await expect.poll(() => names(page)).toEqual(expected);
		await expect(page.locator('#take-select .item[aria-checked="true"]')).toContainText(
			'microphone.wav'
		);
		await expect(page.locator('#take-select')).toHaveAttribute(
			'data-display-label',
			'microphone.wav'
		);
	}
	await page.locator('#take-select .item[aria-checked="true"]').click();
	await expect(page.locator('#take-select button.trigger')).toHaveAttribute(
		'aria-expanded',
		'false'
	);
	await expect
		.poll(() => page.evaluate('window.voiceApp.state.previousTake.name'))
		.toBe('own-b.wav');
	await page.locator('#take-select button.trigger').click();
	await page.locator('#take-select .choice-row[aria-label="own-a.wav"] .item').click();
	await studio.until(app.ownName('own-a.wav') + ' && ' + app.idle);
	await studio.open('/ja/');
	await studio.until(app.ready + ' && ' + app.analysed);
	await page.locator('#take-select button.trigger').click();
	await expect(control(page, 'longest')).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => names(page)).toEqual(orders.longest);
	await expect(page.locator('#take-select .item[aria-checked="true"]')).toContainText('own-a.wav');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-a.wav');
});

test('keyboard sorting and a rename keep focus on the intended control or take', async ({
	page,
	studio
}) => {
	await control(page, 'name').click();
	const current = page.locator('#take-select .item[aria-checked="true"]');
	await current.focus();
	await page.keyboard.press('ArrowUp');
	await expect(control(page, 'longest')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(control(page, 'longest')).toHaveAttribute('aria-checked', 'true');
	await expect(control(page, 'longest')).toBeFocused();
	await expect(page.locator('#take-select button.trigger')).toHaveAttribute(
		'aria-expanded',
		'true'
	);
	await page.keyboard.press('Home');
	await expect(
		page.locator('#take-select .choice-row[aria-label="microphone.wav"] .item')
	).toBeFocused();
	await page.keyboard.press('End');
	await expect(
		page.locator(
			'#take-select .choice-row[aria-label="own-b.wav"] .row-action[data-action="delete"]'
		)
	).toBeFocused();
	await control(page, 'name').click();
	const key = await current.getAttribute('data-key');
	expect(key).toBeTruthy();
	await current.hover();
	await page
		.locator('#take-select .item[aria-checked="true"] + .row-action[data-action="rename"]')
		.click();
	await page.locator('#take-select input.rename').fill('zzz');
	await page.keyboard.press('Enter');
	await studio.until(app.ownName('zzz') + ' && ' + app.idle);
	await expect.poll(() => names(page)).toEqual(['own-a.wav', 'own-b.wav', 'zzz']);
	const renamed = page.locator('#take-select .choice-row[aria-label="zzz"] .item');
	await expect(renamed).toHaveAttribute('data-key', key!);
	await expect(renamed).toHaveAttribute('aria-checked', 'true');
	await expect(renamed).toBeFocused();
});
