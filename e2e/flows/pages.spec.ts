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
