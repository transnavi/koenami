import { test, expect, type Page } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const preset = (values: Record<string, unknown>) => async (page: Page) => page.addInitScript((v) => { for (const [k, val] of Object.entries(v)) localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val)); }, values);

test.describe('session and settings', () => {
	test('theme: saved dark, system dark, toggle button, settings select', async ({ page, studio }) => {
		// theme.js runs before app.js; capture what it sets before anything else.
		await studio.open('/ja/', async (p) => {
			await p.addInitScript(() => {
				localStorage.setItem('voice-theme', 'dark');
				new MutationObserver(() => { (window as unknown as { __firstTheme?: string }).__firstTheme ??= document.documentElement.dataset.theme; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
			});
		});
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('saved-dark', { extra: { firstTheme: await page.evaluate('window.__firstTheme') } });
		await studio.canvas('dark-map', '#voice-map');
		await studio.canvas('dark-signal', '#signal-canvas');
		await studio.canvas('dark-profile', '#profile-canvas');
		await page.locator('#theme-button').click();
		await studio.tick(300);
		await studio.golden('toggled-light');
		await page.locator('#settings-button').click();
		await studio.tick(100);
		await studio.golden('settings-open');
		await studio.choose('theme-select', 'system');
		await studio.tick(300);
		await studio.golden('theme-system-light');
		await page.emulateMedia({ colorScheme: 'dark' });
		await studio.tick(300);
		await studio.golden('theme-system-dark');
		await studio.choose('theme-select', 'dark');
		await page.emulateMedia({ colorScheme: 'light' });
		await studio.tick(300);
		await studio.golden('theme-dark-pinned');
		await page.keyboard.press('Escape');
		await studio.tick(100);
		await studio.golden('settings-closed-by-escape');
	});

	test('system preference and a storage that throws', async ({ page, studio }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(200);
		await studio.golden('system-dark-default');
		await studio.open('/ja/', async (p) => p.addInitScript(() => {
			const broken = () => { throw new Error('storage disabled'); };
			Object.defineProperty(window, 'localStorage', { get: () => ({ getItem: broken, setItem: broken, removeItem: broken, key: broken, length: 0 }) });
		}));
		await studio.until(ready);
		await studio.tick(1200);
		await studio.golden('storage-throws');
	});

	test('the saved session restores library, reference, range, map and signal state', async ({ page, studio }) => {
		await studio.open('/ja/', preset({
			'voice-favorites': ['common_voice_ja_36363165'],
			'voice-speed': '1.25',
			'koenami-session': {
				lang: 'ja', group: 'all', sort: 'low', search: '2624', reference: 'common_voice_ja_36363165', referenceRange: [0.5, 2],
				openSpeakers: ['ja:Common Voice:50a288fb7fb3'], dimension: 2, projection: 'contrast', yaw: 0.4, tilt: 0.2, zoom: 1.3, camera: [0.1, 0.2, 0.3], center: [0.5, 0.5, 0.5], pan: [10, -5],
				autoRotate: false, signal: 'spectrogram', overlay: false, signalSource: 'ref', liveShapeSeconds: 12
			}
		}));
		await studio.until(ready);
		await studio.until('!!window.voiceApp.state.ranges.ref');
		await studio.tick(1200);
		await studio.golden('restored');
		await studio.canvas('restored-map', '#voice-map');
		await studio.canvas('restored-signal', '#signal-canvas');
		await expect(page.locator('#playback-speed')).toHaveValue('1.25');
	});

	test('corrupt or foreign-language sessions are ignored', async ({ studio }) => {
		await studio.open('/ja/', preset({ 'koenami-session': '{not json', 'voice-favorites': '[broken' }));
		await studio.until(ready);
		await studio.tick(1200);
		await studio.golden('corrupt-session');
		await studio.open('/ja/', preset({ 'koenami-session': { lang: 'en', group: 'male', sort: 'name', search: 'x' } }));
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('other-language-session');
	});

	test('settings: live window, live shape window, normalize, exports, info dialog', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#settings-button').click();
		await studio.choose('live-window', '6');
		await page.locator('#live-shape-window').fill('20');
		await page.locator('#normalize').uncheck();
		await studio.tick(1200);
		await studio.golden('settings-changed');
		const measurements = await studio.download(() => page.locator('#export').click());
		await studio.golden('exported', { extra: { measurements } });
		await page.locator('#settings-dialog [data-close]').click();
		await page.locator('#info-button').click();
		await studio.tick(100);
		await studio.golden('info-open');
		// Clicking the backdrop closes the dialog.
		await page.mouse.click(2, 2);
		await studio.tick(100);
		await studio.golden('info-closed-by-backdrop');
		await page.locator('#settings-button').click();
		await page.locator('#settings-dialog .dialog-heading').click();
		await studio.tick(100);
		await studio.golden('dialog-inner-click-keeps-open');
		await page.locator('#settings-dialog [data-close]').click();
		await studio.tick(100);
		await studio.golden('settings-closed');
	});
});
