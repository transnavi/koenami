import { test } from '../fixtures';
import { app } from '../hooks';

// The rendered pages, pixel for pixel, at the states the other scenarios reach: what the
// DOM projection and the canvas goldens cannot see (spacing, colour, type, the layout's
// breakpoints) is held here. Light and dark, desktop and phone.
const dark = async (page: import('@playwright/test').Page) =>
	page.addInitScript(() => localStorage.setItem('voice-theme', 'dark'));

test.describe('studio screens', () => {
	test('cold start, a selected reference, own audio and its dialogs', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(600);
		await studio.screen('studio-cold');
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until(app.selected('common_voice_ja_36363165') + ' && ' + app.idle);
		// A chosen reference plays; the screen is taken once it has paused, as the cursor's
		// place follows real time.
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(600);
		await studio.screen('studio-reference');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed + ' && ' + app.shareReady);
		await studio.tick(4000);
		await studio.screen('studio-analysed');
		await page.locator('#share-button').click();
		await studio.until(app.shareImage);
		await studio.tick(300);
		await studio.screen('studio-share-dialog');
		await page.locator('#share-dialog [data-close]').click();
		await page.locator('#settings-button').click();
		await studio.tick(200);
		await studio.screen('studio-settings');
		await page.keyboard.press('Escape');
		await page.locator('#take-select button.trigger').click();
		await studio.tick(200);
		await studio.screen('studio-take-menu');
	});

	test('dark theme', async ({ page, studio }) => {
		await studio.open('/ja/', dark);
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed + ' && ' + app.shareReady);
		await studio.tick(4000);
		await studio.screen('studio-dark');
		await page.locator('#share-button').click();
		await studio.until(app.shareImage);
		await studio.tick(300);
		await studio.screen('studio-dark-share-dialog');
	});

	test('the other languages', async ({ studio }) => {
		for (const lang of ['zh-CN', 'en', 'ko']) {
			await studio.open(`/${lang}/`);
			await studio.until(app.languageLoaded(lang) + ' && ' + app.notBusy);
			await studio.tick(600);
			await studio.screen(`studio-${lang}`);
		}
	});
});

test.describe('phone screens', () => {
	test.use({ viewport: { width: 390, height: 844 } });
	test('the studio, its sample sheet and the guide', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(600);
		await studio.screen('phone-cold');
		await page.locator('#samples-toggle').click();
		await studio.tick(300);
		await studio.screen('phone-sheet');
		await page.keyboard.press('Escape');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		// The notice of the loaded file fades after a few seconds.
		await studio.tick(4000);
		await studio.screen('phone-analysed');
	});
	test('dark phone', async ({ studio }) => {
		await studio.open('/ja/', dark);
		await studio.until(app.ready);
		await studio.tick(600);
		await studio.screen('phone-dark');
	});
});

test.describe('page screens', () => {
	for (const path of ['/method.html', '/guide.html', '/tutorial.html', '/references.html']) {
		const name = path.replace(/^\/|\.html$/g, '');
		test(name, async ({ page, studio }) => {
			await studio.open(path);
			await page.evaluate(() => document.fonts.ready);
			await studio.tick(300);
			await studio.screen(`page-${name}`);
		});
		test(`${name}, dark`, async ({ page, studio }) => {
			await studio.open(path, dark);
			await page.evaluate(() => document.fonts.ready);
			await studio.tick(300);
			await studio.screen(`page-${name}-dark`);
		});
	}
	test('the result page', async ({ studio }) => {
		await studio.open('/r?v=1&l=ja&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86&age=27');
		await studio.until('!document.getElementById("result-image").hidden');
		await studio.tick(600);
		await studio.screen('page-result');
	});
});
