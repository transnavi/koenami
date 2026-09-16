import { test, expect } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';

test.describe('phone layout', () => {
	test.use({ viewport: { width: 390, height: 844 } });
	test('bottom-sheet sample browser', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('phone');
		await page.locator('#samples-toggle').click();
		await studio.tick(100);
		await studio.golden('sheet-open');
		await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
		await studio.until('window.voiceApp.state.selected?.id === "common_voice_ja_36363165"');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('sheet-closed-by-choice');
		await page.locator('#samples-toggle').click();
		await page.keyboard.press('Escape');
		await studio.tick(100);
		await studio.golden('sheet-closed-by-escape');
		await page.setViewportSize({ width: 1440, height: 960 });
		await studio.tick(300);
		await studio.golden('widened');
		await page.locator('#samples-toggle').click();
		await studio.tick(100);
		await studio.golden('toggle-on-desktop-scrolls');
		await page.setViewportSize({ width: 390, height: 844 });
		await page.locator('#samples-toggle').click();
		await page.setViewportSize({ width: 1440, height: 960 });
		await studio.tick(300);
		await studio.golden('sheet-closed-by-widening');
	});
});

test.describe('method page', () => {
	test('renders with the saved theme and links back to the root', async ({ page, studio }) => {
		await studio.open('/method.html', async (p) => p.addInitScript(() => localStorage.setItem('voice-theme', 'dark')));
		await studio.tick(100);
		await studio.golden('method');
		await expect(page.locator('a[href="/"]').first()).toBeVisible();
		await expect(page).toHaveTitle(/Koenami/);
	});
});

test.describe('keyboard guard', () => {
	test('shortcuts are ignored inside inputs, selects and open dialogs', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#search').focus();
		await page.keyboard.press('r');
		await page.keyboard.press('Space');
		await studio.tick(200);
		await studio.golden('typed-into-search');
		await page.locator('#settings-button').click();
		await page.keyboard.press('r');
		await studio.tick(200);
		await studio.golden('ignored-in-dialog');
		await page.keyboard.press('Escape');
		await page.locator('#sort button.trigger').focus();
		await page.keyboard.press('r');
		await studio.tick(200);
		await studio.golden('ignored-in-select');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Control+r');
		await studio.tick(200);
		await studio.golden('ctrl-r-ignored');
	});
});

test.describe('static pages', () => {
	for (const path of ['/tutorial.html', '/guide.html']) {
		test(`${path} renders in both themes`, async ({ page, studio }) => {
			await studio.open(path);
			await studio.tick(100);
			await studio.golden(path.slice(1, -5));
			await expect(page.locator('a[href="/"]').first()).toBeVisible();
			await page.emulateMedia({ colorScheme: 'dark' });
			await studio.open(path, async (p) => p.addInitScript(() => localStorage.setItem('voice-theme', 'system')));
			await studio.tick(100);
			await studio.golden(`${path.slice(1, -5)}-dark`);
		});
	}
});
