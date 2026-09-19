import { test } from '../fixtures';
import { app } from '../hooks';

// The document head of every page, after the page has started: what search engines,
// link previews and the install prompt read. The DOM projection covers the body only, and
// the studio's canonical, hreflang and manifest links once went missing without a golden
// noticing. Projected: the title, the metadata (description, robots, Open Graph, Twitter,
// the web-app metas), the canonical, alternate, manifest and sitemap links and the
// structured data; the shell's icons, theme colours, scripts and stylesheets are not (a
// rewrite may carry its own). The result page's title changes with its parameters, so the
// head is read after the page has rendered.
const head = () =>
	[...document.head.children]
		.map((el) => {
			const tag = el.tagName.toLowerCase();
			if (tag === 'title') return `title: ${el.textContent}`;
			if (tag === 'meta') {
				const name = el.getAttribute('name') || el.getAttribute('property');
				return name && !/^theme-color$/.test(name)
					? `meta ${name}: ${el.getAttribute('content')}`
					: null;
			}
			if (tag === 'link') {
				const rel = el.getAttribute('rel');
				return rel && /^(canonical|alternate|manifest|sitemap)$/.test(rel)
					? `link ${rel}${el.getAttribute('hreflang') ? ` ${el.getAttribute('hreflang')}` : ''}: ${el.getAttribute('href')}`
					: null;
			}
			if (tag === 'script' && el.getAttribute('type') === 'application/ld+json')
				return `ld+json: ${JSON.stringify(JSON.parse(el.textContent || 'null'))}`;
			return null;
		})
		.filter((line): line is string => line !== null);

test.describe('document heads', () => {
	for (const lang of ['ja', 'zh-CN', 'en', 'ko']) {
		test(`the studio in ${lang}`, async ({ page, studio }) => {
			await studio.open(`/${lang}/`);
			await studio.until(app.languageLoaded(lang));
			await studio.golden(`studio-${lang}`, { extra: { head: await page.evaluate(head) } });
		});
	}
	test('the root and the research library', async ({ page, studio }) => {
		await studio.open('/');
		await studio.until(app.ready);
		await studio.golden('root', { extra: { head: await page.evaluate(head) } });
		await studio.open('/lab/');
		await studio.until(app.ready);
		await studio.golden('lab', { extra: { head: await page.evaluate(head) } });
	});
	for (const path of ['/method.html', '/guide.html', '/tutorial.html', '/references.html']) {
		const name = path.replace(/^\/|\.html$/g, '');
		test(name, async ({ page, studio }) => {
			await studio.open(path);
			await studio.golden(`page-${name}`, { extra: { head: await page.evaluate(head) } });
		});
	}
	// The result page in each language with a verdict, and the Japanese page with no
	// measurements and with an unparsable one. This spec is the first to open `/r` in the
	// run, so its coverage of the result module carries the block ranges of both the
	// verdict path and the two early returns; a later document reads the module flat.
	const results = [
		['ja', '/r?v=1&l=ja&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86&age=27'],
		['en', '/r?v=1&l=en&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86&age=27'],
		['ko', '/r?v=1&l=ko&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86&age=27'],
		['ja-no-values', '/r?v=1&l=ja'],
		['ja-unparsable', '/r?v=1&l=ja&f0=abc&df=1&hnr=1&bal=1&sp=1']
	];
	for (const [name, path] of results) {
		test(`the shared result: ${name}`, async ({ page, studio }) => {
			await studio.open(path);
			await studio.until(
				'!document.getElementById("result-image").hidden || document.getElementById("result-status").textContent.trim().length > 0'
			);
			await studio.tick(300);
			await studio.golden(`result-${name}`, { extra: { head: await page.evaluate(head) } });
		});
	}
});
