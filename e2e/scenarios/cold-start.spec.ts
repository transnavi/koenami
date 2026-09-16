import { test, expect } from '../fixtures';

test.describe('cold start', () => {
	test('Japanese studio with an empty session', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until('!!window.voiceApp?.state.refFull');
		await studio.tick(1500);
		await studio.golden('loaded');
		await expect(page.locator('#play-mine')).toBeDisabled();
		await studio.canvas('map', '#voice-map');
		await studio.canvas('profile', '#profile-canvas');
		await studio.canvas('signal', '#signal-canvas');
	});
});
