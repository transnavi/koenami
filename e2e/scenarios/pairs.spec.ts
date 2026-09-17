import { test, expect } from '../fixtures';
import { pairs } from '../hooks';

// Both sides loop A → B → A; pause before observing.
async function paused(page: import('@playwright/test').Page, studio: { until: (e: string, ms?: number) => Promise<void>; tick: (ms?: number) => Promise<void> }) {
	await studio.until('document.querySelector("#side-a[aria-pressed=true], #side-b[aria-pressed=true]") !== null', 3000).catch(() => {});
	if (await page.evaluate('document.querySelector("#side-a[aria-pressed=true], #side-b[aria-pressed=true]") !== null')) await page.keyboard.press(' ');
	await studio.until('document.querySelector("#side-a[aria-pressed=true], #side-b[aria-pressed=true]") === null');
	await studio.tick(100);
}

test.describe('pairwise comparison page', () => {
	test('queue, keys, playback, save, skip, reload and failures', async ({ page, studio }) => {
		await studio.open('/pairs.html');
		await studio.until(pairs.loaded);
		// The loop hands B the turn when A ends; a held side stops at its own end.
		await studio.until('document.querySelector("#side-b[aria-pressed=true]") !== null', 20_000);
		await page.keyboard.press('w');
		await studio.until('document.querySelector("#side-a[aria-pressed=true], #side-b[aria-pressed=true]") === null', 20_000);
		await studio.tick(100);
		await studio.golden('loaded');
		await page.keyboard.press('x');
		for (const key of ['1', '2', '3']) await page.keyboard.press(key);
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('3');
		await page.keyboard.press('3');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Control+1');
		await studio.tick(100);
		await studio.golden('answered-by-keyboard');
		await page.locator('#questions .question').nth(0).click();
		await page.locator('#questions .question').nth(1).locator('button').nth(1).click();
		await studio.tick(100);
		await studio.golden('answered-by-pointer');
		// Q holds A, W holds B, Space pauses and resumes, R restarts the loop.
		await page.keyboard.press('q');
		await studio.until('document.querySelector("#side-a[aria-pressed=true]") !== null');
		await page.keyboard.press('w');
		await studio.until('document.querySelector("#side-b[aria-pressed=true]") !== null');
		await page.keyboard.press(' ');
		await studio.until('document.querySelector("#side-b[aria-pressed=true]") === null');
		await studio.tick(100);
		await studio.golden('held-then-paused');
		await page.keyboard.press(' ');
		await studio.until('document.querySelector("#side-b[aria-pressed=true]") !== null');
		await page.keyboard.press('r');
		await studio.until('document.querySelector("#side-a[aria-pressed=true]") !== null');
		await page.locator('#side-b').click();
		await studio.until('document.querySelector("#side-b[aria-pressed=true]") !== null');
		await page.locator('#loop').click();
		await page.locator('#side-a').click();
		await paused(page, studio);
		await studio.golden('buttons');
		await page.locator('#note').fill('Aのほうが息が多い');
		await page.keyboard.press('x');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Enter');
		await studio.until(pairs.at(1));
		await paused(page, studio);
		await studio.golden('saved');
		await page.locator('#note').focus();
		await page.keyboard.press('Escape');
		await page.keyboard.press('Enter');
		await studio.tick(100);
		await studio.golden('empty-save-refused');
		await page.keyboard.press('s');
		await paused(page, studio);
		await studio.golden('skipped');
		await page.keyboard.press('2');
		await studio.tick(1200);
		await studio.open('/pairs.html');
		await studio.until(pairs.loaded);
		await studio.tick(200);
		await studio.golden('draft-restored');
		await page.locator('#skip').click();
		await paused(page, studio);
		await page.keyboard.press('1');
		await page.locator('#save').click();
		await studio.until(pairs.at(3));
		await paused(page, studio);
		await studio.golden('saved-by-button');
		await page.locator('#theme-button').click();
		await studio.tick(100);
		await studio.golden('dark');
		await page.locator('#theme-button').click();
		await studio.tick(100);
		await studio.golden('light');
		await page.route('**/api/pairs**', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 422, contentType: 'text/plain', body: 'unknown clip' }) : route.continue());
		await page.keyboard.press('1');
		await page.keyboard.press('Enter');
		await studio.until('document.getElementById("status").textContent.includes("保存できませんでした")');
		await studio.tick(100);
		await studio.golden('save-failed');
	});

	test('a session that expired, a queue that fails to load, and keys on the empty page', async ({ page, studio }) => {
		await studio.open('/pairs.html', async (p) => p.addInitScript(() => {
			localStorage.setItem('voice-theme', 'dark');
			localStorage.setItem('koenami-review-session', JSON.stringify({ id: 'stale', at: 0 }));
			localStorage.setItem('koenami-pairs', '{broken');
		}));
		await studio.until(pairs.loaded);
		await paused(page, studio);
		await studio.golden('new-session');
		await page.route('**/api/pairs**', (route) => route.fulfill({ status: 500, body: 'broken' }));
		await studio.open('/pairs.html');
		await studio.tick(300);
		await studio.golden('load-failed');
		await page.keyboard.press('1');
		await page.keyboard.press('s');
		await page.keyboard.press('Enter');
		await page.keyboard.press(' ');
		await studio.tick(100);
		await studio.golden('keys-without-queue');
		await expect(page.locator('#card')).toBeHidden();
	});

	test('the last pair of the queue', async ({ page, studio }) => {
		await page.route('**/api/pairs?*', async (route) => { const response = await route.fetch(); const json = await response.json(); await route.fulfill({ response, json: { ...json, queue: json.queue.slice(0, 1) } }); });
		await studio.open('/pairs.html');
		await studio.until(pairs.loaded);
		await paused(page, studio);
		await page.keyboard.press('1');
		await page.keyboard.press('Enter');
		await studio.until('!document.getElementById("done").hidden');
		await studio.tick(100);
		await studio.golden('queue-finished');
		await page.keyboard.press('1');
		await page.keyboard.press('s');
		await page.keyboard.press('Enter');
		await studio.tick(100);
		await studio.golden('keys-after-finish');
	});
});
