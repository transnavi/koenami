import { test, expect } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const lang = (id: string) => `window.voiceApp?.state.lang === ${JSON.stringify(id)} && !window.voiceApp.state.loadingLanguage && !!window.voiceApp.state.refFull`;

test.describe('reference language', () => {
	test('switching languages pushes the route and restores it on back', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		for (const id of ['zh-CN', 'en', 'ko']) {
			await studio.choose('language', id);
			await studio.until(lang(id));
			await studio.tick(300);
			await studio.golden(`switched-${id}`);
		}
		await studio.canvas('map-ko', '#voice-map');
		await page.goBack();
		await studio.until(lang('en'));
		await studio.tick(300);
		await studio.golden('back-to-en');
		await page.goForward();
		await studio.until(lang('ko'));
		await studio.tick(300);
		await studio.golden('forward-to-ko');
		await studio.choose('language', 'ja');
		await studio.until(lang('ja'));
		await studio.tick(1200);
		await studio.golden('back-to-ja');
	});

	test('direct routes: /en/, an unknown language and the root', async ({ page, studio }) => {
		await studio.open('/en/');
		await studio.until(lang('en'));
		await studio.tick(1200);
		await studio.golden('direct-en');
		await studio.open('/xx/');
		await studio.until(lang('ja'));
		await studio.tick(300);
		await studio.golden('unknown-falls-back');
		// The root keeps the language of the saved session.
		await studio.open('/', async (p) => p.addInitScript(() => localStorage.setItem('koenami-session', JSON.stringify({ lang: 'ko', group: 'male', sort: 'name' }))));
		await studio.until(lang('ko'));
		await studio.tick(300);
		await studio.golden('root-with-session');
		await expect(page.locator('.brand')).toHaveAttribute('href', '/');
	});
});
