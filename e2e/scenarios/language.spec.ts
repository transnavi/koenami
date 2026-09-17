import { test, expect } from '../fixtures';
import { app } from '../hooks';

test.describe('reference language', () => {
	// Each language is its own document: choosing one saves the session and navigates to
	// /<lang>/, and the browser history moves between the documents.
	test('switching languages navigates to the language page and history moves between them', async ({
		page,
		studio
	}) => {
		await studio.open('/');
		await studio.until(app.ready);
		// In 2D the contrast axis needs sixteen speakers per group; smaller libraries fall
		// back to the principal components.
		await page.locator('[data-dimension="2"]').click();
		await page.locator('[data-projection="contrast"]').click();
		await studio.tick(200);
		// Choosing a language saves the session and navigates to the language's page.
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
		// Back through the language pages, each a document of its own that is waited for
		// before the next step. The last step lands on the root entry, whose page finds the
		// saved session's language (zh-CN, from the first switch of this visit) and sends the
		// visitor to that language's page again (web/public/language.js).
		for (const lang of ['ko', 'en', 'zh-CN']) {
			await studio.back();
			await studio.until(app.languageLoaded(lang) + ' && ' + app.notBusy);
		}
		await studio.back();
		await studio.settled();
		await studio.tick(300);
		expect(new URL(page.url()).pathname).toBe('/zh-CN/');
		await studio.golden('back-to-root-redirected');
	});

	test('a language chosen while an analysis is running is dropped', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		// Choosing a language navigates to its page; while the studio is busy the select is
		// disabled, so the click is dropped and nothing navigates.
		let release = () => {};
		await page.route(
			'**/api/analyze',
			async (route) => {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				await route.continue();
			},
			{ times: 1 }
		);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.busy);
		await page.locator('#language button.trigger').click({ force: true });
		await studio.tick(300);
		await studio.golden('language-choice-while-busy');
		release();
		await studio.until(app.analysed + ' && ' + app.notBusy);
		await studio.tick(300);
		expect(new URL(page.url()).pathname).toBe('/ja/');
		await studio.golden('language-choice-dropped');
	});

	test('direct routes: /en/, an unknown language, the root', async ({ page, studio }) => {
		await studio.open('/en/');
		await studio.until(app.languageLoaded('en') + ' && ' + app.notBusy);
		await studio.tick(1200);
		await studio.golden('direct-en');
		// Unknown language routes are not served at all (worker.ts answers 404).
		const missing = await page.goto('/xx/');
		expect(missing?.status()).toBe(404);
		// The root sends a visitor whose saved session names another language to that
		// language's page before anything renders (web/public/language.js).
		await studio.open('/', async (p) =>
			p.addInitScript(() =>
				localStorage.setItem(
					'koenami-session',
					JSON.stringify({ lang: 'ko', group: 'male', sort: 'name' })
				)
			)
		);
		await studio.until(app.languageLoaded('ko') + ' && ' + app.notBusy);
		await studio.tick(300);
		await studio.golden('root-with-session');
		expect(new URL(page.url()).pathname).toBe('/ko/');
		await expect(page.locator('.brand')).toHaveAttribute('href', '/ko/');
	});
});

test('a saved session naming an unknown language falls back to Japanese', async ({ studio }) => {
	await studio.open('/', async (p) =>
		p.addInitScript(() => localStorage.setItem('koenami-session', JSON.stringify({ lang: 'xx' })))
	);
	await studio.until(app.languageLoaded('ja') + ' && ' + app.notBusy);
	await studio.tick(300);
	await studio.golden('unknown-session-language');
});
