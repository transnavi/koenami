import { test, expect } from '../fixtures';

const ready = '!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage';
const lang = (id: string) => `window.voiceApp?.state.lang === ${JSON.stringify(id)} && !window.voiceApp.state.loadingLanguage`;

// The research library (KOENAMI_PUBLIC=0 only) replaces the gender groups by teacher
// configurations.
test.describe('research library', () => {
	test('teacher filters, research naming and English words', async ({ page, studio }) => {
		await studio.open('/ja/');
		await studio.until(ready);
		await studio.choose('language', 'lab');
		await studio.until(lang('lab') + ' && !!window.voiceApp.state.refFull');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await studio.tick(300);
		await studio.golden('lab');
		await studio.canvas('lab-map', '#voice-map');
		// The group select is disabled for the research library.
		await page.locator('#library-group button.trigger').click({ force: true });
		await page.locator('#library-group button.trigger').focus();
		await page.keyboard.press('ArrowDown');
		await studio.tick(100);
		await studio.golden('group-select-disabled');
		await studio.choose('teacher', '002');
		await studio.tick(200);
		await studio.golden('teacher-002');
		await studio.choose('teacher-pitch', 'high');
		await studio.choose('teacher-resonance', 'low');
		await studio.choose('teacher-weight', 'med');
		await studio.tick(200);
		await studio.golden('teacher-filters');
		await studio.choose('teacher', 'all');
		await studio.choose('teacher-pitch', 'all');
		await studio.choose('teacher-resonance', 'all');
		await studio.choose('teacher-weight', 'all');
		await studio.choose('sort', 'name');
		await studio.tick(200);
		await studio.golden('teacher-all');
		await page.locator('#sample-list details.speaker-folder[data-speaker*="003"] summary').first().click();
		await page.locator('.sample-row[data-id="lab-3"]').click();
		await studio.until('window.voiceApp.state.selected?.id === "lab-3" && !!window.voiceApp.state.refFull');
		await page.locator('#play-reference').click();
		await studio.until('document.getElementById("reference-player").paused');
		await page.locator('#signal-ref').click();
		await page.locator('#words-button').click();
		await studio.until('!!window.voiceApp.state.words.ref');
		await studio.tick(300);
		await studio.golden('lab-clip-words');
		await page.locator('#upload').setInputFiles(studio.audio('own-a.wav'));
		await studio.until('!!window.voiceApp.state.ownFull && !window.voiceApp.state.busy && window.voiceApp.state.analyzing.size === 0');
		await studio.tick(1200);
		await studio.golden('lab-own-uploaded');
		// A small library has no density model, so the fit readout stays empty.
		await studio.choose('language', 'en');
		await studio.until(lang('en') + ' && !!window.voiceApp.state.refFull');
		await studio.tick(300);
		await studio.golden('small-library-no-fit');
		await studio.choose('language', 'ja');
		await studio.until(lang('ja') + ' && !!window.voiceApp.state.refFull');
		await studio.tick(300);
		await studio.golden('back-from-lab');
	});
});
