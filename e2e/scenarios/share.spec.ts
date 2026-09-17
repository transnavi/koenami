import { test, expect } from '../fixtures';
import { app } from '../hooks';

test.describe('verdict and sharing', () => {
	test('readout, help dialogs, the share dialog, link, image and system share', async ({ page, context, studio }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await studio.open('/ja/');
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('verdict-before-any-take');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.until(app.shareReady);
		await studio.tick(1200);
		await studio.golden('verdict');
		await studio.canvas('verdict-profile', '#profile-canvas');

		await page.locator('#share-button').click();
		await studio.until(app.shareImage);
		await studio.tick(300);
		await studio.golden('share-dialog');
		await page.locator('#verdict-help').click();
		await studio.tick(100);
		await studio.golden('verdict-help');
		await page.locator('#metric-dialog [data-close]').click();
		await page.locator('#share-copy').click();
		await studio.until('document.getElementById("share-status").textContent !== ""');
		await studio.tick(100);
		await studio.golden('link-copied', { extra: { clipboard: await page.evaluate(() => navigator.clipboard.readText()) } });
		await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')), configurable: true }); });
		await page.locator('#share-copy').click();
		await studio.until('document.getElementById("share-status").textContent.startsWith("http")');
		await studio.tick(100);
		await studio.golden('link-copy-failed');
		const image = await studio.download(() => page.locator('#share-save').click());
		await studio.golden('image-saved', { extra: { image } });
		await page.locator('#share-dialog [data-close]').click();

		// The readout opens the same dialog; a system share sheet, where the browser has one,
		// receives the text, the link and the card.
		await page.evaluate(() => {
			const w = window as unknown as { __shared?: unknown[] };
			w.__shared = [];
			Object.defineProperty(navigator, 'canShare', { value: (data: { files?: File[] }) => !!data.files, configurable: true });
			Object.defineProperty(navigator, 'share', { value: async (data: { title: string; text: string; url: string; files?: File[] }) => { w.__shared!.push({ title: data.title, text: data.text, url: data.url, files: data.files?.map((f) => [f.name, f.type, f.size]) }); }, configurable: true });
		});
		await page.locator('#verdict-readout').click();
		await studio.until(app.shareImage);
		await page.locator('#share-system').click();
		await studio.until('window.__shared.length === 1');
		await studio.tick(100);
		await studio.golden('system-shared', { extra: { shared: await page.evaluate('window.__shared') } });
		// A sheet that takes no files receives the text and the link.
		await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }); Object.defineProperty(navigator, 'share', { value: async (data: { title: string; text: string; url: string; files?: File[] }) => { (window as unknown as { __shared: unknown[] }).__shared.push({ title: data.title, text: data.text, url: data.url, files: data.files?.length ?? null }); }, configurable: true }); });
		await page.locator('#share-system').click();
		await studio.until('window.__shared.length === 2');
		await studio.tick(100);
		await studio.golden('system-shared-without-file', { extra: { shared: await page.evaluate('window.__shared') } });
		await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }); Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('cancelled', 'AbortError'); }, configurable: true }); });
		await page.locator('#share-system').click();
		await studio.tick(300);
		await studio.golden('system-share-cancelled');
		await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: async () => { throw new Error('no sheet'); }, configurable: true }); });
		await page.locator('#share-system').click();
		await studio.until('document.getElementById("share-status").textContent === "no sheet"');
		await studio.tick(100);
		await studio.golden('system-share-failed');
		await page.locator('#share-dialog [data-close]').click();

		// The card cannot be drawn without its fonts.
		await page.route('**/fonts/**', (route) => route.abort('failed'));
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.until(app.shareReady);
		await page.locator('#share-button').click();
		await studio.until('document.getElementById("share-status").textContent !== ""');
		await studio.tick(100);
		await studio.golden('image-failed');
		await page.locator('#share-save').click();
		await studio.tick(100);
		await studio.golden('save-failed');
		await page.locator('#share-dialog [data-close]').click();
		// Closing the dialog before the card is ready drops the image.
		await page.unroute('**/fonts/**');
		let release: (() => void) | null = null;
		await page.route('**/fonts/koenami-share-700.ttf', async (route) => { await new Promise<void>((r) => { release = r; }); await route.continue(); });
		const held = page.waitForRequest('**/fonts/koenami-share-700.ttf');
		await page.locator('#share-button').click();
		await held;
		await page.locator('#share-dialog [data-close]').click();
		release!();
		await studio.tick(500);
		await studio.golden('closed-before-image');
		// An SVG the browser cannot decode.
		await page.evaluate(() => { (window as unknown as { Image: unknown }).Image = class { decoding = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { Promise.resolve().then(() => this.onerror?.()); } }; });
		await page.locator('#share-button').click();
		await studio.until('document.getElementById("share-status").textContent === "画像を作成できませんでした。"');
		await studio.tick(100);
		await studio.golden('image-decode-failed');
		await page.locator('#share-dialog [data-close]').click();
	});

	test('a clipping take and an unstable resonance fail the gate', async ({ page, studio }) => {
		let patch: Record<string, number> = { clipping_fraction: 0.02 };
		await page.route('**/api/analyze', async (route) => { const response = await route.fetch(); const json = await response.json(); await route.fulfill({ response, json: { ...json, ...patch } }); });
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.tick(600);
		await studio.golden('gate-clipping');
		patch = { resonance_sensitivity_pct: 20 };
		await page.locator('#upload').setInputFiles(studio.audio('own-b.wav'));
		await studio.until(app.ownNameStartsWith('own-b'));
		await studio.until(app.analysed);
		await studio.tick(600);
		await studio.golden('gate-resonance');
	});

	test('a take that fails the quality gate has no verdict', async ({ page, studio }) => {
		await page.route('**/api/catalog', async (route) => {
			const response = await route.fetch();
			const catalog = await response.json();
			catalog.capabilities.maxSeconds = 2;
			await route.fulfill({ response, json: catalog });
		});
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.keyboard.press('r');
		await studio.until(app.recording);
		await studio.until(app.buffered(1.4));
		await page.keyboard.press('r');
		await studio.until(app.stopped + ' && ' + app.ownSamples);
		await studio.tick(200);
		await studio.golden('pending', { maskAudio: true });
		await studio.until(app.idle);
		await studio.tick(600);
		await studio.golden('gated', { maskAudio: true });
		await page.locator('#verdict-readout').click({ force: true });
		await studio.tick(100);
		await studio.golden('readout-disabled', { maskAudio: true });
	});

	test('the shared result page', async ({ page, context, studio }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await studio.open('/ja/');
		await studio.until(app.ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(app.analysed);
		await studio.until(app.shareReady);
		await page.locator('#share-button').click();
		await studio.until(app.shareImage);
		const link = new URL(await page.locator('#share-open').getAttribute('href') || '');
		const withParams = (changes: Record<string, string>) => { const params = new URLSearchParams(link.search); for (const [key, value] of Object.entries(changes)) params.set(key, value); return `${link.pathname}?${params}`; };
		await studio.open(link.pathname + link.search);
		await studio.until('!document.getElementById("result-image").hidden');
		await studio.tick(300);
		await studio.golden('result');
		await page.locator('#result-copy').click();
		await studio.until('document.getElementById("result-status").textContent !== ""');
		await studio.golden('result-link-copied', { extra: { clipboard: await page.evaluate(() => navigator.clipboard.readText()) } });
		await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')), configurable: true }); });
		await page.locator('#result-copy').click();
		await studio.until('document.getElementById("result-status").textContent.startsWith("http")');
		await studio.golden('result-link-copy-failed');
		const image = await studio.download(() => page.locator('#result-save').click());
		await studio.tick(1100);
		await studio.golden('result-image-saved', { extra: { image } });
		await studio.open(link.pathname + link.search, async (p) => p.addInitScript(() => {
			Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
			Object.defineProperty(navigator, 'share', { value: async (data: { text: string; url: string; files?: File[] }) => { (window as unknown as { __shared: unknown[] }).__shared = [{ text: data.text, url: data.url, files: data.files?.length }]; }, configurable: true });
		}));
		await studio.until('!document.getElementById("result-image").hidden');
		await page.locator('#result-actions button').first().click();
		await studio.until('Array.isArray(window.__shared)');
		await studio.tick(100);
		await studio.golden('result-system-shared', { extra: { shared: await page.evaluate('window.__shared') } });
		await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: async () => { throw new Error('no sheet'); }, configurable: true }); });
		await page.locator('#result-actions button').first().click();
		await studio.until('document.getElementById("result-status").textContent === "no sheet"');
		await studio.golden('result-system-share-failed');
		await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('cancelled', 'AbortError'); }, configurable: true }); });
		await page.locator('#result-actions button').first().click();
		await studio.tick(300);
		await studio.golden('result-system-share-cancelled');

		await studio.open('/r?v=1&l=ja');
		await studio.tick(300);
		await studio.golden('result-missing-values');
		await studio.open(withParams({ l: 'xx' }));
		await studio.tick(300);
		await studio.golden('result-unknown-language');
		await studio.open(withParams({ v: '7' }));
		await studio.until('!document.getElementById("result-image").hidden');
		await studio.tick(300);
		await studio.golden('result-other-version');
		await studio.open(withParams({ l: 'ko' }));
		await studio.until('document.getElementById("result-status").textContent !== ""');
		await studio.tick(300);
		await studio.golden('result-no-verdict-for-language');
		await page.route('**/api/library**', (route) => route.fulfill({ status: 500, body: 'x' }));
		await studio.open(link.pathname + link.search);
		await studio.until('document.getElementById("result-status").textContent !== ""');
		await studio.tick(300);
		await studio.golden('result-library-failed');
		await page.unroute('**/api/library**');
		await page.route('**/api/library**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
		await studio.open(link.pathname + link.search);
		await studio.until('document.getElementById("result-status").textContent !== ""');
		await studio.tick(300);
		await studio.golden('result-library-without-clips');
		await page.unroute('**/api/library**');
		// The medians of the fixture library's female and male representatives at the pinned
		// commit, and their midpoint (see Scorer in score.js); defaults for the language and the version.
		for (const [name, query] of [['female', 'f0=209.2&df=1146.5&hnr=13.21&bal=-19.05&sp=5.17'], ['male', 'f0=128.6&df=1030.3&hnr=9.13&bal=-15.23&sp=6.39'], ['midpoint', 'f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86']] as const) {
			await studio.open(`/r?${query}`);
			await studio.until('!document.getElementById("result-image").hidden');
			await studio.tick(300);
			await studio.golden(`result-${name}`);
		}
		await studio.open('/r?v=1&l=ja&f0=abc&df=1&hnr=1&bal=1&sp=1');
		await studio.tick(300);
		await studio.golden('result-unparsable-value');
		await page.route('**/fonts/**', (route) => route.abort('failed'));
		await studio.open(link.pathname + link.search);
		await studio.until('document.getElementById("result-status").textContent !== ""');
		await studio.tick(300);
		await studio.golden('result-image-failed');
		await page.locator('#result-save').click();
		await studio.tick(100);
		await studio.golden('result-save-failed');
		await expect(page.locator('#result-try')).toHaveAttribute('href', '/ja/');
	});
});
