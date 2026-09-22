import { app } from '../hooks';
import { test, expect } from './fixtures';

for (const path of ['/method.html', '/guide.html', '/tutorial.html', '/references.html']) {
	test(`${path} renders its content and a link to the studio`, async ({ page, studio }) => {
		await studio.open(path);
		await expect(page).toHaveTitle(/Koenami/);
		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('main')).toContainText(/\S/);
		await expect(page.locator('a[href="/"]').first()).toBeVisible();
	});
}

test('the English tutorial has its own language, sources and navigation', async ({
	page,
	studio
}) => {
	await studio.open('/en/');
	await expect(page.locator('#info-dialog a[href="/en/tutorial.html"]')).toHaveAttribute(
		'hreflang',
		'en'
	);
	await studio.open('/en/tutorial.html');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.locator('h1')).toContainText('How the voice works');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://koe.transnavi.jp/en/tutorial.html'
	);
	const article = JSON.parse(await page.locator('script[type="application/ld+json"]').innerHTML());
	expect(article.inLanguage).toBe('en');
	expect(article.url).toBe('https://koe.transnavi.jp/en/tutorial.html');
	expect(
		await page
			.locator('main a[href^="#"]')
			.evaluateAll((links) =>
				links
					.map((link) => link.getAttribute('href')!.slice(1))
					.filter((id) => !document.getElementById(id))
			)
	).toEqual([]);
	await page.getByRole('link', { name: '日本語', exact: true }).click();
	await expect(page).toHaveURL(/\/tutorial\.html$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
	await page.getByRole('link', { name: 'English', exact: true }).click();
	await expect(page).toHaveURL(/\/en\/tutorial\.html$/);
	await page.setViewportSize({ width: 360, height: 800 });
	await expect(page.locator('h1')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.locator('.method-header .brand').click();
	await expect(page).toHaveURL(/\/en\/$/);
});

test('dismissing the first-visit guide persists across visits', async ({ page, studio }) => {
	await studio.open('/ja/', undefined, { tour: true });
	await studio.until(app.ready);
	await studio.tick(700);
	await expect(page.locator('dialog.tour-card')).toBeVisible();
	await page.locator('dialog.tour-card [data-act=skip]').click();
	await expect(page.locator('dialog.tour-card')).toBeHidden();
	await studio.open('/ja/', undefined, { tour: true });
	await studio.until(app.ready);
	await studio.tick(700);
	await expect(page.locator('dialog.tour-card')).toBeHidden();
	await expect(page.locator('#record')).toBeEnabled();
});
