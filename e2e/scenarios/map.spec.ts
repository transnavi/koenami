import { test, expect, type Page } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const analysed = '!!window.voiceApp?.state.ownFull && !window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0';

// Canvas-space position of a plotted sample, taken from the map's hit list.
const hit = (id: string) => `(() => { const p = window.voiceApp.map.hit.find(h => h.sample.id === ${JSON.stringify(id)}); return p ? [p.xy[0], p.xy[1]] : null; })()`;
async function pointOn(page: Page, id: string) {
	const box = (await page.locator('#voice-map').boundingBox())!;
	const xy = (await page.evaluate(hit(id))) as [number, number] | null;
	if (!xy) throw new Error(`${id} is not plotted`);
	return { x: box.x + xy[0], y: box.y + xy[1] };
}
async function drag(page: Page, from: [number, number], to: [number, number], options: { shift?: boolean; button?: 'left' | 'middle' | 'right' } = {}) {
	const box = (await page.locator('#voice-map').boundingBox())!;
	if (options.shift) await page.keyboard.down('Shift');
	await page.mouse.move(box.x + from[0], box.y + from[1]);
	await page.mouse.down({ button: options.button || 'left' });
	await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 4 });
	await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 4 });
	await page.mouse.up({ button: options.button || 'left' });
	if (options.shift) await page.keyboard.up('Shift');
}

test.describe('voice map', () => {
	test('dimensions, projections, zoom, pan, orbit, reset and fit', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until(analysed);
		await studio.tick(600);

		await page.locator('[data-dimension="2"]').click();
		await studio.tick(300);
		await studio.golden('2d-contrast');
		await studio.canvas('2d-contrast', '#voice-map');
		await page.locator('[data-projection="variance"]').click();
		await page.locator('[data-projection="variance"]').click();
		await studio.tick(300);
		await studio.golden('2d-variance');
		await studio.canvas('2d-variance', '#voice-map');

		await page.locator('#zoom-in').click();
		await page.locator('#zoom-in').click();
		await studio.tick(300);
		await studio.canvas('2d-zoomed-in', '#voice-map');
		await page.locator('#zoom-out').click();
		await studio.tick(300);
		await drag(page, [400, 300], [500, 350]);
		await studio.tick(300);
		await studio.canvas('2d-panned', '#voice-map');
		await page.locator('#find-me').click();
		await studio.tick(300);
		await studio.canvas('2d-find-me', '#voice-map');
		await page.locator('#reset-view').click();
		await studio.tick(300);
		await studio.golden('2d-reset');
		await studio.canvas('2d-reset', '#voice-map');

		await page.locator('[data-dimension="3"]').click();
		await studio.tick(300);
		await studio.golden('3d');
		await drag(page, [400, 300], [520, 340]);
		await studio.tick(300);
		await studio.canvas('3d-orbited', '#voice-map');
		await drag(page, [400, 300], [450, 300], { shift: true });
		await studio.tick(300);
		await studio.canvas('3d-shift-panned', '#voice-map');
		await drag(page, [400, 300], [380, 320], { button: 'middle' });
		await drag(page, [400, 300], [380, 320], { button: 'right' });
		await studio.tick(300);
		await studio.canvas('3d-button-panned', '#voice-map');
		const box = (await page.locator('#voice-map').boundingBox())!;
		await page.mouse.move(box.x + 400, box.y + 300);
		await page.mouse.wheel(0, -240);
		await studio.tick(300);
		await studio.canvas('3d-wheel-in', '#voice-map');
		await page.locator('#voice-map').dispatchEvent('wheel', { deltaY: 3, deltaMode: 1, clientX: box.x + 400, clientY: box.y + 300 });
		await page.locator('#voice-map').dispatchEvent('wheel', { deltaY: 0.2, deltaMode: 2, clientX: box.x + 400, clientY: box.y + 300 });
		await studio.tick(300);
		await studio.canvas('3d-wheel-lines-pages', '#voice-map');
		await page.locator('#find-me').click();
		await studio.tick(300);
		await studio.canvas('3d-find-me', '#voice-map');
		await page.locator('#voice-map').focus();
		for (const key of ['ArrowRight', 'ArrowUp', 'Shift+ArrowLeft', 'Shift+ArrowDown', '+', '=', '-']) await page.keyboard.press(key);
		await studio.tick(300);
		await studio.canvas('3d-keyboard', '#voice-map');
		await page.keyboard.press('0');
		await studio.tick(300);
		await studio.golden('3d-keyboard-reset');
		await studio.canvas('3d-keyboard-reset', '#voice-map');
	});

	test('pinch, tooltip, picking a point and group toggles', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await page.locator('[data-dimension="2"]').click();
		await studio.tick(300);
		// Two synthetic pointers, as a touch pinch delivers them.
		await page.locator('#voice-map').evaluate((canvas) => {
			const at = (id: number, x: number, y: number, type: string) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: canvas.getBoundingClientRect().left + x, clientY: canvas.getBoundingClientRect().top + y, bubbles: true, button: 0, pointerType: 'touch', isPrimary: id === 1 }));
			at(1, 300, 300, 'pointerdown'); at(2, 500, 300, 'pointerdown');
			at(1, 280, 300, 'pointermove'); at(2, 540, 310, 'pointermove');
			at(1, 260, 300, 'pointermove'); at(2, 560, 320, 'pointermove');
			at(2, 560, 320, 'pointerup'); at(1, 250, 300, 'pointermove'); at(1, 250, 300, 'pointerup');
		});
		await studio.tick(300);
		await studio.canvas('pinched', '#voice-map');
		await page.locator('#reset-view').click();
		await studio.tick(300);

		const target = await pointOn(page, 'common_voice_ja_36363165');
		await page.mouse.move(target.x, target.y);
		await studio.tick(100);
		await studio.golden('tooltip');
		await page.mouse.move(target.x + 300, target.y + 200);
		await studio.tick(100);
		await studio.golden('tooltip-hidden');
		await page.mouse.click(target.x, target.y);
		await studio.until('window.voiceApp.state.selected?.id === "common_voice_ja_36363165" && !!window.voiceApp.state.refFull');
		await studio.until('!document.getElementById("reference-player").paused');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('picked');
		await page.locator('#show-female').uncheck();
		await studio.tick(300);
		await studio.canvas('no-female', '#voice-map');
		await page.locator('#show-male').uncheck();
		await studio.tick(300);
		await studio.golden('no-groups');
		await studio.canvas('no-groups', '#voice-map');
		await page.locator('#show-female').check();
		await page.locator('#show-male').check();
		await page.locator('[data-dimension="3"]').click();
		await studio.tick(300);
		await studio.canvas('3d-restored', '#voice-map');
	});

	test('auto-rotation advances with the clock', async ({ page, studio }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.tick(300);
		await studio.golden('rotating');
		await studio.canvas('rotating-0', '#voice-map');
		await studio.tick(1000);
		await studio.canvas('rotating-1s', '#voice-map');
		await page.locator('#auto-rotate').click();
		await studio.tick(1000);
		await studio.golden('rotation-stopped');
		await studio.canvas('rotation-stopped', '#voice-map');
		await page.locator('#auto-rotate').click();
		await studio.tick(500);
		await studio.canvas('rotation-resumed', '#voice-map');
	});
});
