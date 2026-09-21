import { app } from '../hooks';
import { test, expect } from './fixtures';

for (const lang of ['ja', 'en', 'zh-CN', 'ko']) {
	test(`tutorial navigation fits the ${lang} toolbar on narrow phones`, async ({
		page,
		studio
	}) => {
		await studio.open(`/${lang}/`);
		await studio.until(app.languageLoaded(lang));
		const tutorialPath = lang === 'en' ? '/en/tutorial.html' : '/tutorial.html';
		const tutorialLang = lang === 'en' ? 'en' : 'ja';
		const link = page.locator(`.toolbar a[href="${tutorialPath}"]`);
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('hreflang', tutorialLang);
		if (lang === 'en') await expect(link).not.toHaveAccessibleName(/Japanese/);
		await expect(link).toHaveAccessibleName(/\S/);
		await page.locator('#info-button').click();
		await expect(page.locator('#info-dialog a').first()).toHaveAttribute('href', tutorialPath);
		await page.keyboard.press('Escape');
		for (const width of [390, 375, 360, 320]) {
			await page.setViewportSize({ width, height: 844 });
			await expect(link).toBeInViewport();
			await expect(page.locator('.toolbar .brand')).toHaveAccessibleName('Koenami');
			await expect(page.locator('#info-button')).toBeInViewport();
			await expect
				.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
				.toBeLessThanOrEqual(width);
		}
		const opened = page.waitForEvent('popup');
		await link.click();
		const tutorial = await opened;
		await expect(tutorial).toHaveURL(new URL(tutorialPath, page.url()).href);
		await expect(tutorial.locator('html')).toHaveAttribute('lang', tutorialLang);
		await expect(tutorial.locator('h1')).toBeVisible();
		await tutorial.close();
	});
}
