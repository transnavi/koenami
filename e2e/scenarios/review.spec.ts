import { test, expect } from '../fixtures';

const loaded = 'window.reviewApp && window.reviewApp.queue.length > 0';
const paused = 'document.querySelector("#play[aria-pressed=false]") !== null';

// Playback starts on every speaker and clip change (except when a draft is restored);
// it is paused before observing. The start is awaited briefly so a click cannot land
// before play() and leave the audio running.
async function settle(page: import('@playwright/test').Page, studio: { until: (e: string, ms?: number) => Promise<void>; tick: (ms?: number) => Promise<void> }) {
	await studio.until('window.reviewApp && window.reviewApp.queue.length > 0');
	await studio.until('document.querySelector("#play[aria-pressed=true]") !== null', 1500).catch(() => {});
	if (await page.evaluate('document.getElementById("play").getAttribute("aria-pressed") === "true"')) await page.locator('#play').click();
	await studio.until(paused);
	await studio.tick(100);
}

test.describe('listening review page', () => {
	test('queue, keyboard ratings and flags, scope, note, save, skip', async ({ page, studio }) => {
		await studio.open('/review.html');
		await studio.until(loaded);
		await settle(page, studio);
		await studio.golden('loaded');

		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowLeft');
		await settle(page, studio);
		await studio.golden('stepped-clip');
		await page.locator('#next-clip').click();
		await page.locator('#prev-clip').click();
		await settle(page, studio);
		await page.keyboard.press('r');
		await studio.until('document.querySelector("#play[aria-pressed=true]") !== null');
		await page.keyboard.press(' ');
		await studio.until(paused);
		await studio.tick(100);
		await studio.golden('replayed-then-paused');

		await page.keyboard.press('Enter');
		await studio.tick(100);
		await studio.golden('empty-save-refused');
		// Digits rate the active scale and move on; ArrowUp/Down move without rating.
		for (const key of ['5', '1', 'ArrowDown', '3', '3', 'ArrowUp', '2', '6', '0', '9']) await page.keyboard.press(key);
		await page.keyboard.press('e');
		await page.keyboard.press('z');
		await page.keyboard.press('x');
		await page.keyboard.press('x');
		await studio.tick(100);
		await studio.golden('rated-by-keyboard');
		await page.locator('#scope-speaker').click();
		await page.locator('#scales .scale').nth(4).click();
		await page.locator('#scales .scale').nth(4).locator('button').nth(2).click();
		await page.locator('#scales .scale').nth(4).locator('button').nth(2).click();
		await page.locator('#quality-flags > button').first().click();
		await page.locator('#note').fill('テスト');
		await page.keyboard.press('Escape');
		await studio.tick(1200);
		await studio.golden('rated-by-pointer');
		await studio.open('/review.html');
		await studio.until(loaded);
		await settle(page, studio);
		await studio.golden('draft-restored');
		await page.locator('#save').click();
		await studio.until('window.reviewApp.at === 1');
		await settle(page, studio);
		await studio.golden('saved');
		await page.keyboard.press('s');
		await settle(page, studio);
		await studio.golden('skipped');
		await page.locator('#note').fill('memo');
		await page.keyboard.press('Enter');
		await studio.until('window.reviewApp.at === 2');
		await settle(page, studio);
		await studio.golden('saved-from-note');
		await page.keyboard.press('z');
		await page.locator('#scope-speaker').click();
		await page.locator('#scope-clip').click();
		await page.keyboard.press('4');
		await page.locator('#prev-speaker').click();
		await settle(page, studio);
		await studio.golden('previous-speaker-with-draft-kept');
		await page.locator('#prev-speaker').click();
		await settle(page, studio);
		await studio.golden('previous-speaker-at-start');
	});

	test('jump list, filter, theme and language', async ({ page, studio }) => {
		await studio.open('/review.html');
		await studio.until(loaded);
		await settle(page, studio);
		await page.locator('#jump').click();
		await studio.tick(100);
		await studio.golden('list-open');
		await page.locator('#list-filter').fill('zzz');
		await studio.tick(100);
		await studio.golden('list-filtered-empty');
		await page.locator('#list-filter').fill('');
		await page.locator('#list-items button').nth(3).click();
		await settle(page, studio);
		await studio.golden('jumped');
		await page.locator('#jump').click();
		await page.keyboard.press('Escape');
		await studio.tick(100);
		await page.locator('#jump').click();
		await page.locator('#list-dialog [data-close]').click();
		await studio.tick(100);
		await studio.golden('list-closed');
		await page.locator('#theme-button').click();
		await studio.tick(100);
		await studio.golden('dark');
		await page.locator('#theme-button').click();
		await studio.choose('lang', 'en');
		await studio.until('window.reviewApp.lang === "en" && window.reviewApp.queue.length > 0');
		await settle(page, studio);
		await studio.golden('english-queue');
		await page.route('**/api/review?lang=ko*', (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'no ko' }));
		await studio.choose('lang', 'ko');
		await studio.until('document.getElementById("status").textContent === "no ko"');
		await studio.tick(300);
		await studio.golden('language-load-failed');
		await page.route('**/api/review', (route) => route.request().method() === 'POST' ? route.fulfill({ status: 422, contentType: 'text/plain', body: 'unknown clip' }) : route.continue());
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('4');
		await page.keyboard.press('Enter');
		await expect(page.locator('#status')).toContainText('保存できませんでした');
		await studio.tick(300);
		await studio.golden('save-failed');
	});

	test('update mode re-reviews a speaker with missing scales', async ({ page, studio }) => {
		await studio.open('/review.html');
		await studio.until(loaded);
		await settle(page, studio);
		await page.locator('#mode button[data-mode="update"]').click();
		await studio.until('window.reviewApp.mode === "update" && window.reviewApp.queue.length > 0');
		await settle(page, studio);
		await studio.golden('update-mode');
		await page.locator('#mode button[data-mode="update"]').click();
		await studio.tick(100);
		await page.keyboard.press('4');
		await page.keyboard.press('Enter');
		await studio.until('window.reviewApp.at === 1');
		await settle(page, studio);
		await studio.golden('update-saved');
		// Jump to the last speaker and finish the queue.
		await page.locator('#jump').click();
		await page.locator('#list-items button').last().click();
		await settle(page, studio);
		await page.keyboard.press('3');
		await page.keyboard.press('Enter');
		await studio.until('window.reviewApp.queue.length === window.reviewApp.at');
		await studio.tick(200);
		await studio.golden('update-done');
		await studio.open('/review.html');
		await studio.until('window.reviewApp && window.reviewApp.mode === "update"');
		await studio.tick(200);
		await studio.golden('update-mode-remembered');
		await page.route('**/api/review?lang=ja&mode=new', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'broken' }));
		await page.locator('#mode button[data-mode="new"]').click();
		await studio.until('document.getElementById("status").textContent === "broken"');
		await studio.tick(200);
		await studio.golden('mode-load-failed');
	});

	test('a legacy single draft is migrated and an unreachable log shows the error', async ({ page, studio }) => {
		await page.route('**/api/review?lang=ja*', (route) => route.fulfill({ status: 500, contentType: 'text/plain', body: 'broken' }));
		await studio.open('/review.html', async (p) => p.addInitScript(() => localStorage.setItem('koenami-review', JSON.stringify({ lang: 'ja', speaker: '23bbcff6f628', clip: 'common_voice_ja_19580185', ratings: { femininity: 2 }, chosen: ['noise'], scope: 'clip', note: 'old', active: 1 }))));
		await studio.tick(300);
		await studio.golden('unreachable');
		await page.unroute('**/api/review?lang=ja*');
		await studio.open('/review.html');
		await studio.until(loaded);
		await settle(page, studio);
		await studio.golden('legacy-draft-migrated');
	});
});
