import { test, expect } from '../fixtures';
import { app } from '../hooks';


test.describe('reference language', () => {
	test('switching languages pushes the route and restores it on back', async ({ page, studio }) => {
		await studio.open('/');
		await studio.until(app.ready);
		// In 2D the contrast axis needs sixteen speakers per group; smaller libraries fall
		// back to the principal components.
		await page.locator('[data-dimension="2"]').click();
		await page.locator('[data-projection="contrast"]').click();
		await studio.tick(200);
		for (const id of ['zh-CN', 'en', 'ko']) {
			await studio.choose('language', id);
			await studio.until(app.languageLoaded(id) + ' && ' + app.notBusy);
			await studio.tick(300);
			await studio.golden(`switched-${id}`);
		}
		await studio.canvas('map-ko', '#voice-map');
		await studio.back();
		await studio.until(app.languageLoaded('en') + ' && ' + app.notBusy);
		await studio.tick(300);
		await studio.golden('back-to-en');
		await studio.forward();
		await studio.until(app.languageLoaded('ko') + ' && ' + app.notBusy);
		await studio.tick(300);
		await studio.golden('forward-to-ko');
		await studio.choose('language', 'ja');
		await studio.until(app.languageLoaded('ja') + ' && ' + app.notBusy);
		await studio.tick(1200);
		await studio.golden('back-to-ja');
		// Back to the root entry, whose path names no language.
		for (let i = 0; i < 4; i++) await studio.back();
		await studio.until(app.languageLoaded('ja') + ' && ' + app.notBusy);
		await studio.tick(300);
		await studio.golden('back-to-root');
	});

	test('direct routes: /en/, an unknown language, the root', async ({ page, studio }) => {
		await studio.open('/en/');
		await studio.until(app.languageLoaded('en') + ' && ' + app.notBusy);
		await studio.tick(1200);
		await studio.golden('direct-en');
		// Unknown language routes are not served at all (worker.ts answers 404).
		const missing = await page.goto('/xx/');
		expect(missing?.status()).toBe(404);
		// The root keeps the language of the saved session.
		await studio.open('/', async (p) => p.addInitScript(() => localStorage.setItem('koenami-session', JSON.stringify({ lang: 'ko', group: 'male', sort: 'name' }))));
		await studio.until(app.languageLoaded('ko') + ' && ' + app.notBusy);
		await studio.tick(300);
		await studio.golden('root-with-session');
		await expect(page.locator('.brand')).toHaveAttribute('href', '/');
	});
});

test('a saved session naming an unknown language falls back to Japanese', async ({ studio }) => {
	await studio.open('/', async (p) => p.addInitScript(() => localStorage.setItem('koenami-session', JSON.stringify({ lang: 'xx' }))));
	await studio.until(app.languageLoaded('ja') + ' && ' + app.notBusy);
	await studio.tick(300);
	await studio.golden('unknown-session-language');
});
