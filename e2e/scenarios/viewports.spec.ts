import { test } from '../fixtures';
import { app } from '../hooks';

// The rendered page under the conditions the main screens leave out: the breakpoints
// between the desktop and the phone (a laptop with browser chrome, a phone held sideways,
// a tablet), and a pixel ratio of 2, where the canvases draw at double resolution and
// the take previews scale (the main screens pin the ratio to 1). Light theme, the studio
// cold and after an analysed take, at every one of them.
const dark = async (page: import('@playwright/test').Page) =>
	page.addInitScript(() => localStorage.setItem('voice-theme', 'dark'));

const viewports = [
	{ tag: 'laptop', viewport: { width: 1366, height: 650 } },
	{ tag: 'phone-landscape', viewport: { width: 844, height: 390 } },
	{ tag: 'tablet', viewport: { width: 768, height: 1024 } }
];

for (const { tag, viewport } of viewports) {
	test.describe(tag, () => {
		test.use({ viewport });
		test('the studio cold and analysed, light and dark', async ({ page, studio }) => {
			await studio.open('/ja/');
			await studio.until(app.ready);
			await studio.tick(600);
			await studio.screen(`${tag}-cold`);
			await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
			await studio.until(app.analysed);
			await studio.tick(4000);
			await studio.screen(`${tag}-analysed`);
		});
		test('dark', async ({ studio }) => {
			await studio.open('/ja/', dark);
			await studio.until(app.ready);
			await studio.tick(600);
			await studio.screen(`${tag}-dark`);
		});
	});
}

test.describe('pixel ratio 2', () => {
	test.use({ deviceScaleFactor: 2 });
	test('desktop', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(600);
		await studio.screen('dpr2-cold');
		await studio.canvas('dpr2-map', '#voice-map');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(4000);
		await studio.screen('dpr2-analysed');
		await studio.canvas('dpr2-signal', '#signal-canvas');
		await page.locator('#take-select button.trigger').click();
		await studio.tick(200);
		await studio.screen('dpr2-take-menu');
	});
	test.describe('phone', () => {
		test.use({ viewport: { width: 390, height: 844 } });
		test('phone', async ({ page, studio }) => {
			await studio.open('/ja/');
			await studio.until(app.ready);
			await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
			await studio.until(app.analysed);
			await studio.tick(4000);
			await studio.screen('dpr2-phone-analysed');
		});
	});
});
