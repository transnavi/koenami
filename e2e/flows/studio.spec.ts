import { app } from '../hooks';
import { test, expect } from './fixtures';

for (const lang of ['ja', 'zh-CN', 'en', 'ko']) {
	test(`the ${lang} studio loads playable references`, async ({ page, studio }) => {
		await studio.open(`/${lang}/`);
		await studio.until(app.languageLoaded(lang));
		await expect(page.locator('html')).toHaveAttribute('lang', lang);
		await expect(page.locator('#selected-name')).not.toHaveText('—');
		await expect(page.locator('#play-reference')).toBeEnabled();
		await expect(page.locator('#play-mine')).toBeDisabled();
		await page.locator('#play-reference').click();
		await expect(page.locator('#reference-player')).toHaveJSProperty('paused', false);
		await page.locator('#play-reference').click();
		await expect(page.locator('#reference-player')).toHaveJSProperty('paused', true);
	});
}

test('reference choice, favorite and theme survive a reload', async ({ page, studio }) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
	await studio.until(app.selected('common_voice_ja_36363165'));
	const name = await page.locator('#selected-name').innerText();
	await page.locator('#favorite-selected').click();
	await expect(page.locator('#favorite-selected')).toHaveAttribute('aria-pressed', 'true');
	await page.locator('#theme-button').click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await studio.open('/ja/');
	await studio.until(app.ready);
	await expect(page.locator('#selected-name')).toHaveText(name);
	await expect(page.locator('#favorite-selected')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the language selector navigates to a working studio', async ({ page, studio }) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await studio.choose('language', 'en');
	await expect(page).toHaveURL(/\/en\/$/);
	await studio.until(app.languageLoaded('en'));
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('#play-reference')).toBeEnabled();
});

test('uploaded audio can be played, renamed, restored, exported and deleted', async ({
	page,
	studio
}) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-a.wav');
	await expect(page.locator('#report-button')).toBeEnabled();
	await page.locator('#play-mine').click();
	await expect(page.locator('#player')).toHaveJSProperty('paused', false);
	await page.locator('#play-mine').click();
	await expect(page.locator('#player')).toHaveJSProperty('paused', true);
	await page.locator('#take-select button.trigger').click();
	await page.locator('#take-select .item[aria-checked="true"]').hover();
	await page.locator('#take-select .row-action[data-value="0"][data-action="rename"]').click();
	await page.locator('#take-select input.rename').fill('朝の練習');
	await page.keyboard.press('Enter');
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '朝の練習');
	await studio.until(app.idle);
	await studio.open('/ja/');
	await studio.until(app.ready + ' && ' + app.analysed);
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', '朝の練習');
	await expect(page.locator('#play-mine')).toBeEnabled();
	const download = await studio.download(() => studio.rowAction('take-select', '0', 'download'));
	expect(download.name).toMatch(/\.wav$/);
	expect(download.bytes).toBeGreaterThan(44);
	await studio.rowAction('take-select', '0', 'delete');
	await studio.until(app.idle);
	await expect(page.locator('#play-mine')).toBeDisabled();
	await studio.open('/ja/');
	await studio.until(app.ready);
	await expect(page.locator('#play-mine')).toBeDisabled();
});

test('a failed recording analysis preserves the take for retry', async ({ page, studio }) => {
	await page.route('**/api/analyze', (route) =>
		route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' })
	);
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.keyboard.press('r');
	await studio.until(app.recording);
	await studio.until(app.buffered(1.4));
	await page.keyboard.press('r');
	await studio.until(app.stopped + ' && ' + app.analysisPending + ' && ' + app.idle);
	await expect(page.locator('#play-mine')).toBeEnabled();
	await expect(page.locator('#notice')).toBeVisible();
	await studio.open('/ja/');
	await studio.until(app.ready + ' && ' + app.analysisPending);
	await expect(page.locator('#play-mine')).toBeEnabled();
	await page.unroute('**/api/analyze');
	await studio.choose('take-select', 'retry');
	await studio.until(app.analysed + ' && !(' + app.analysisPending + ')');
	await expect(page.locator('#report-button')).toBeEnabled();
	await expect(page.locator('#play-mine')).toBeEnabled();
});

test('Escape cancels a recording without replacing the saved take', async ({ page, studio }) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await page.keyboard.press('r');
	await studio.until(app.recording);
	await page.keyboard.press('Escape');
	await studio.until(app.stopped + ' && ' + app.idle);
	await expect(page.locator('#take-select')).toHaveAttribute('data-display-label', 'own-a.wav');
	await expect(page.locator('#play-mine')).toBeEnabled();
});

test('an analysed take produces a downloadable card and a working result link', async ({
	page,
	studio
}) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed + ' && ' + app.shareReady);
	await page.locator('#share-button').click();
	await studio.until(app.shareImage);
	await expect(page.locator('#share-dialog')).toBeVisible();
	await expect(page.locator('#share-score strong')).toHaveText(/\d/);
	const download = await studio.download(() => page.locator('#share-save').click());
	expect(download.name).toMatch(/\.png$/);
	expect(download.bytes).toBeGreaterThan(1000);
	const link = await page.locator('#share-open').getAttribute('href');
	expect(link).toBeTruthy();
	const result = new URL(link!, page.url());
	expect(result.pathname).toBe('/r');
	await studio.open(result.pathname + result.search);
	await expect(page.locator('#result-image')).toBeVisible();
	await expect
		.poll(() =>
			page.locator('#result-image').evaluate((image) => (image as HTMLImageElement).naturalWidth)
		)
		.toBeGreaterThan(0);
	await expect(page.locator('#result-score strong')).toHaveText(/\d/);
});

test('phone reference browser opens, selects and closes without horizontal overflow', async ({
	page,
	studio
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#samples-toggle').click();
	await expect(page.locator('#sample-browser')).toBeVisible();
	await page.locator('.sample-row[data-id="common_voice_ja_36363165"]').click();
	await studio.until(app.selected('common_voice_ja_36363165'));
	await expect(page.locator('#sample-browser')).toBeHidden();
	await expect(page.locator('#record')).toBeInViewport();
	const size = await page.evaluate(() => ({
		content: document.documentElement.scrollWidth,
		viewport: window.innerWidth
	}));
	expect(size.content).toBeLessThanOrEqual(size.viewport);
});

test('the closest-to-you order ranks speakers by the analyzer’s similarity model', async ({
	page,
	studio
}) => {
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await studio.choose('library-group', 'all');
	await studio.choose('sort', 'near');
	await expect(page.locator('#sort-basis')).toHaveText(/声質をとらえたベクトル/);
	const top = await page.evaluate(() => {
		const s = (
			window as unknown as {
				voiceApp: { state: { similar: { speakers: Map<string, { clip: string }> } } };
			}
		).voiceApp.state;
		const [speaker, entry] = [...s.similar.speakers.entries()][0];
		return { speaker, clip: entry.clip };
	});
	const folder = page.locator('#sample-list details').first();
	await expect(folder).toHaveAttribute('data-speaker', new RegExp(`:${top.speaker}$`));
	await folder.locator('summary').click();
	const lead = folder.locator('.sample-row').first();
	await expect(lead).toHaveAttribute('data-id', top.clip);
	await expect(lead.locator('.nearest-badge')).toHaveText('最も近い');
	// A second take under the same order is ranked anew, without touching the sort.
	const firstKey = await page.evaluate(
		() =>
			(window as unknown as { voiceApp: { state: { similar: { key: string } } } }).voiceApp.state
				.similar.key
	);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await studio.until(`window.voiceApp.state.similar?.key !== ${JSON.stringify(firstKey)}`);
	await expect(page.locator('#sort-basis')).toHaveText(/声質をとらえたベクトル/);
	await expect(folder.locator('.sample-row').first().locator('.nearest-badge')).toHaveText(
		'最も近い'
	);
});

test('a failed similarity ranking is not retried until the order is chosen again', async ({
	page,
	studio
}) => {
	let requests = 0;
	await page.route('**/api/similar**', (route) => {
		requests++;
		void route.fulfill({ status: 503, contentType: 'text/plain', body: 'busy' });
	});
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await studio.choose('sort', 'near');
	await expect(page.locator('#notice')).toContainText('busy');
	await expect(page.locator('#sort-basis')).toHaveText(/5つの測定値/);
	await page.locator('#search').fill('F');
	await page.locator('#search').fill('');
	expect(requests).toBe(1);
	await studio.choose('sort', 'name');
	await studio.choose('sort', 'near');
	await expect.poll(() => requests).toBe(2);
});

/* Selecting a section of the take is the signal view's gesture target, and the seam that
   drives it (`selectRange`) is the same code path. */
function selectSection(page: import('@playwright/test').Page, start = 0.5, end = 2.5) {
	return page.evaluate(
		([a, b]) =>
			(
				window as unknown as {
					voiceApp: { selectRange: (side: string, range: [number, number]) => void };
				}
			).voiceApp.selectRange('own', [a, b]),
		[start, end] as [number, number]
	);
}

/* The speaker a measurement sorts first. Folders hold their clips only while open, so the
   folder itself is the stable read of the order. */
function listedLead(page: import('@playwright/test').Page) {
	return page.evaluate(
		() => document.querySelector('#sample-list details')?.getAttribute('data-speaker') ?? null
	);
}

/* The speaker the acoustic order should lead with for the measurement installed right now:
   the one holding the clip nearest to it (ties by clip id, as the library sorts). */
function expectedLead(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		type C = { id: string; speaker: string; dataset?: string; group: string; features: unknown };
		const w = window as unknown as {
			voiceApp: {
				state: { lang: string; clips: C[]; own: { features: unknown } | null };
				map: { space: { distance: (a: unknown, b: unknown) => number } };
			};
		};
		const { state, map } = w.voiceApp;
		let best: C | null = null,
			bestD = Infinity;
		for (const c of state.clips) {
			const d = map.space.distance(c.features, state.own?.features);
			if (d < bestD || (d === bestD && best && c.id < best.id)) [best, bestD] = [c, d];
		}
		return best && Number.isFinite(bestD)
			? `${state.lang}:${best.dataset || best.group}:${best.speaker}`
			: null;
	});
}

test('the list follows the measurement a take or a section installs', async ({ page, studio }) => {
	// The acoustic order is the one that goes stale here, so the ranking is kept unavailable.
	await page.route('**/api/similar**', (route) =>
		route.fulfill({ status: 503, contentType: 'text/plain', body: 'busy' })
	);
	await studio.open('/ja/');
	await studio.until(app.ready);
	await studio.choose('library-group', 'all');
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await studio.choose('sort', 'near');
	const inStep = async () => {
		const want = await expectedLead(page);
		expect(want, 'the installed measurement ranks some speaker first').not.toBeNull();
		await expect.poll(() => listedLead(page)).toBe(want);
	};

	// A recorded take is listed while its analysis is pending and re-sorted once it lands.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('r');
	await studio.until(app.recording);
	await studio.until(app.buffered(2.5));
	await page.keyboard.press('r');
	await studio.until(app.stopped + ' && ' + app.idle);
	await studio.until(app.analysed + ' && !(' + app.analysisPending + ')');
	await inStep();

	// A section installs its own measurement, and clearing it restores the take's.
	await selectSection(page, 0.8, 2.0);
	await studio.until(app.rangeApplied('own'));
	await inStep();
	await page.locator('#range-reset').click();
	await studio.until(app.noRange('own'));
	await inStep();
});

test('restoring a take with a section asks for one ranking', async ({ page, studio }) => {
	const asked: string[] = [];
	await page.route('**/api/similar**', (route) => {
		asked.push(route.request().url());
		return route.fallback();
	});
	await studio.open('/ja/');
	await studio.until(app.ready);
	await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
	await studio.until(app.analysed);
	await studio.choose('library-group', 'all');
	await studio.choose('sort', 'near');
	await studio.until('!!window.voiceApp.state.similar');
	await selectSection(page);
	await studio.until(app.range('own'));
	await studio.settled();
	// Starting and cancelling a recording restores the take exactly as it was, section included.
	const before = asked.length;
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('r');
	await studio.until(app.recording);
	await page.keyboard.press('Escape');
	await studio.until(app.stopped + ' && ' + app.idle);
	await studio.until('!!window.voiceApp.state.similar || !!window.voiceApp.state.similarKey');
	expect(asked.length - before).toBe(1);
});
