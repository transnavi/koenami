import { test, expect } from '../fixtures';
import { app, tour } from '../hooks';

const card = 'dialog.tour-card';

test.describe('first-visit guide', () => {
	test('walks through the studio, pauses, resumes, finishes and restarts', async ({ page, studio }) => {
		await studio.open('/ja/', undefined, { tour: true });
		await studio.until(app.ready);
		await studio.tick(700);
		await studio.until(tour.open);
		await studio.tick(100);
		await studio.golden('step-1');
		// Other keys and clicks inside the card change nothing.
		await page.keyboard.press('x');
		await page.locator('#tour-text').click();
		await studio.tick(100);
		await studio.golden('ignored-input');
		for (let n = 2; n <= 4; n++) {
			await page.locator(`${card} [data-act=next]`).click();
			await studio.until(tour.step(n));
			await studio.tick(100);
			await studio.golden(`step-${n}`);
		}
		await page.keyboard.press('ArrowLeft');
		await studio.until(tour.step(3));
		await page.keyboard.press('ArrowRight');
		await studio.until(tour.step(4));
		await page.locator(`${card} [data-act=back]`).click();
		await studio.until(tour.step(3));
		// Focus that leaves the card comes back to its main button.
		await page.locator('#record').focus();
		await studio.tick(100);
		await studio.golden('focus-kept');
		await page.locator(`${card} [data-act=later]`).click();
		await studio.until(tour.closed);
		await studio.tick(100);
		await studio.golden('paused');
		await studio.open('/ja/', undefined, { tour: true });
		await studio.until(app.ready);
		await studio.tick(700);
		await studio.until(tour.open);
		await studio.tick(100);
		await studio.golden('resumed');
		await page.keyboard.press('Escape');
		await studio.until(tour.closed);
		await page.locator('#tour-restart').click();
		await studio.until(tour.step(1));
		await studio.tick(100);
		await studio.golden('restarted');
		await page.locator(`${card} [data-act=skip]`).click();
		await studio.until(tour.closed);
		await studio.tick(100);
		await studio.golden('skipped');
		await studio.open('/ja/', undefined, { tour: true });
		await studio.until(app.ready);
		await studio.tick(1000);
		await studio.golden('done-stays-done');
		// Restarting from an open dialog closes that dialog first; the last step finishes.
		await page.locator('#info-button').click();
		await page.locator('#tour-restart').dispatchEvent('click');
		await studio.until(tour.step(1));
		for (let n = 2; n <= 9; n++) { await page.keyboard.press('ArrowRight'); await studio.until(tour.step(n)); }
		await studio.tick(100);
		await studio.golden('last-step');
		await page.keyboard.press('ArrowRight');
		await studio.until(tour.closed);
		await studio.tick(100);
		await studio.golden('finished');
		await expect(page.locator(card)).toBeHidden();
	});

	test('phone placement', async ({ page, studio }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await studio.open('/ja/', async (p) => p.addInitScript(() => localStorage.setItem('voice-tour', JSON.stringify({ step: 1 }))), { tour: true });
		await studio.until(app.ready);
		await studio.tick(700);
		await studio.until(tour.open);
		await studio.tick(100);
		await studio.golden('phone-step-2');
		await page.locator(`${card} [data-act=next]`).click();
		await studio.until(tour.step(3));
		await studio.tick(100);
		await studio.golden('phone-step-3');
		await page.locator(`${card} [data-act=next]`).click();
		await studio.until(tour.step(4));
		await studio.tick(100);
		await studio.golden('phone-step-4');
		await page.locator(`${card} [data-act=skip]`).click();
		await studio.until(tour.closed);
	});

	test('a corrupt saved state starts from the beginning', async ({ studio }) => {
		await studio.open('/ja/', async (p) => p.addInitScript(() => localStorage.setItem('voice-tour', '{nope')), { tour: true });
		await studio.until(app.ready);
		await studio.tick(700);
		await studio.until(tour.open);
		await studio.tick(100);
		await studio.golden('from-corrupt-state');
	});
});
