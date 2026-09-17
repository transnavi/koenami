import { test, expect } from '../fixtures';
import { app } from '../hooks';

test.describe('cold start', () => {
	test('Japanese studio with an empty session', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.tick(1000);
		await studio.until(app.ready);
		await studio.tick(1500);
		await studio.golden('loaded');
		await expect(page.locator('#play-mine')).toBeDisabled();
		// Without own audio the signal canvas ignores pointer and keyboard input.
		await page.locator('#signal-canvas').click({ position: { x: 300, y: 60 } });
		await page.locator('#signal-canvas').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Shift+ArrowLeft');
		await page.locator('body').click({ position: { x: 5, y: 5 } });
		await page.keyboard.press('Escape');
		await page.locator('#signal-canvas').dispatchEvent('pointerup', { offsetX: 10, offsetY: 10 });
		await page.locator('#signal-canvas').dispatchEvent('pointercancel');
		await studio.tick(200);
		await studio.golden('inert-signal-input');
		await studio.canvas('map', '#voice-map');
		await studio.canvas('profile', '#profile-canvas');
		await studio.canvas('signal', '#signal-canvas');
	});
});
