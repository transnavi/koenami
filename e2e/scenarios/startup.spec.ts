import { test, type Page } from '../fixtures';
import { app } from '../hooks';

// The window between the document and its scripts, which the other scenarios skip: what a
// visitor types or presses before the page is wired must survive the wiring, a script
// that never arrives must leave a usable static page, and a browser without a storage or
// audio API must not take the whole page down.

// Holds every script of the page except the shell's (theme, language) until released.
async function holdScripts(page: Page) {
	let release: (() => void) | null = null;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(
		(url) => /\.js(\?|$)/.test(url.pathname) && !/\/(theme|language)\.js$/.test(url.pathname),
		async (route) => {
			await held;
			await route.continue();
		}
	);
	return () => release!();
}

test.describe('before the scripts run', () => {
	test('typing, a toggle and a shortcut before the page is wired', async ({ page, studio }) => {
		const release = await holdScripts(page);
		await studio.open('/ja/', undefined, { ready: false });
		await page.locator('#search').waitFor();
		await page.locator('#search').fill('カレー');
		await page.locator('#show-male').click();
		await page.keyboard.press('r');
		await page.keyboard.press('Space');
		await studio.tick(100);
		await studio.golden('static-page-with-input');
		release();
		await page.unroute(() => true);
		await studio.ready();
		await studio.until(app.ready);
		await studio.tick(300);
		await studio.golden('wired-after-input');
	});

	test('a script that never arrives', async ({ page, studio }) => {
		await page.route(
			(url) => /\.js(\?|$)/.test(url.pathname) && !/\/(theme|language)\.js$/.test(url.pathname),
			(route) => route.abort('connectionfailed')
		);
		await studio.open('/ja/', undefined, { ready: false });
		await page.locator('#search').waitFor();
		await studio.tick(500);
		// The one page error names the failed import by its URL, which carries the build's
		// content hash and changes every build; the golden leaves it out. The screen and the
		// rest of the projection show the static page is intact.
		await studio.golden('scripts-failed', { extra: { errors: undefined } });
		await studio.screen('scripts-failed');
	});

	test('no IndexedDB and no AudioContext', async ({ page, studio }) => {
		await studio.open(
			'/ja/',
			async (p) =>
				p.addInitScript(() => {
					Object.defineProperty(window, 'indexedDB', { get: () => undefined });
					// @ts-expect-error the page is being deprived of it
					delete window.AudioContext;
					// @ts-expect-error same
					delete window.webkitAudioContext;
				}),
			{ ready: false }
		);
		await page.locator('#search').waitFor();
		// The library still loads; the reference's audio cannot be decoded without an
		// AudioContext, and the missing store is reported.
		await studio.ready();
		await studio.until(app.libraryLoaded + ' && ' + app.idle);
		await studio.tick(1500);
		await studio.golden('without-storage-and-audio');
		await studio.screen('without-storage-and-audio');
	});
});
