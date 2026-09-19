// The deployed Worker's routing and headers, path by path: what each address answers
// (status, content type, cache and security headers, the page title or the redirect
// target) for the addresses the site owns and the ones it must refuse. The mock server
// never runs worker.ts, so this is checked against a deployed Worker: a preview or
// production.
//
//   node --experimental-strip-types e2e/live/routes.ts <base-url>            compare with the golden
//   node --experimental-strip-types e2e/live/routes.ts <base-url> --record   write the golden
//   node --experimental-strip-types e2e/live/routes.ts <base-a> <base-b>     diff two Workers
import { readFileSync, writeFileSync } from 'node:fs';

const GOLDEN = 'tests/golden/live/routes.json';
const PATHS = [
	'/',
	'/ja',
	'/ja/',
	'/en',
	'/en/',
	'/zh-CN/',
	'/ko/',
	'/EN/',
	'/fr/',
	'/lab/',
	'/index.html',
	'/ja/index.html',
	'/guide.html',
	'/method.html',
	'/tutorial.html',
	'/references.html',
	'/review.html',
	'/pairs.html',
	'/r',
	'/r?v=1&l=ja&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86&age=27',
	'/r?v=1&l=en&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86',
	'/r?v=1&l=xx&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86',
	'/r?v=1&l=ja&f0=abc',
	'/r.html',
	'/en/r.html',
	'/og.png?v=1&l=ja&f0=163.54&df=1080.72&hnr=10.9&bal=-16.89&sp=5.86',
	'/og.png',
	'/site.webmanifest',
	'/en/site.webmanifest',
	'/ja/site.webmanifest',
	'/service-worker.js',
	'/sw.js',
	'/language.js',
	'/theme.js',
	'/robots.txt',
	'/sitemap.xml',
	'/favicon.svg',
	'/_app/',
	'/_app/version.json',
	'/_app/immutable/',
	'/assets/app.js',
	'/api/catalog',
	'/api/library?lang=ja',
	'/api/library?lang=xx',
	'/api/health',
	'/api/analyze',
	'/api/nope',
	'/public-api/ja.json',
	'/samples/',
	'/data/samples/',
	'/models/manifest.json',
	'/Dockerfile',
	'/server.py',
	'/.env'
];
const HEADERS = [
	'content-type',
	'cache-control',
	'content-security-policy',
	'x-content-type-options',
	'permissions-policy',
	'referrer-policy',
	'location',
	'retry-after'
];
type Answer = Record<string, string | number>;

async function answer(base: string, path: string, init?: RequestInit): Promise<Answer> {
	const res = await fetch(base + path, { redirect: 'manual', ...init });
	const out: Answer = { status: res.status };
	for (const h of HEADERS) {
		const v = res.headers.get(h);
		if (v) out[h] = h === 'content-type' ? v.split(';')[0].trim() : v;
	}
	const type = String(out['content-type'] || '');
	if (type === 'text/html') {
		const html = await res.text();
		out.title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
		out.lang = html.match(/<html lang="([^"]*)"/)?.[1] ?? '';
		// The entry chunk's name changes every build; whether the page loads one from the
		// build's directory does not.
		out.app = /\/_app\/immutable\//.test(html)
			? 'kit'
			: /\/assets\/[\w.-]+\.js/.test(html)
				? 'vite'
				: 'none';
	} else if (type === 'application/json' || type === 'application/manifest+json') {
		const json = (await res.json()) as Record<string, unknown>;
		out.keys = Object.keys(json).sort().join(',');
		if (typeof json.lang === 'string') out.lang = json.lang;
		if (typeof json.start_url === 'string') out.start_url = json.start_url;
	} else if (type === 'image/png') {
		out.bytes = (await res.arrayBuffer()).byteLength > 1000 ? 'image' : 'small';
	} else await res.arrayBuffer();
	return out;
}

async function table(base: string): Promise<Record<string, Answer>> {
	const out: Record<string, Answer> = {};
	for (const path of PATHS) out[`GET ${path}`] = await answer(base, path);
	out['HEAD /'] = await answer(base, '/', { method: 'HEAD' });
	out['POST /api/analyze from another origin'] = await answer(base, '/api/analyze', {
		method: 'POST',
		headers: { Origin: 'https://evil.example' },
		body: new Uint8Array(64)
	});
	out['POST /api/analyze too short'] = await answer(base, '/api/analyze', {
		method: 'POST',
		headers: { 'Content-Type': 'application/octet-stream' },
		body: new Uint8Array(64)
	});
	return out;
}

const diff = (a: Record<string, Answer>, b: Record<string, Answer>) => {
	const lines: string[] = [];
	for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const x = JSON.stringify(a[key] ?? null),
			y = JSON.stringify(b[key] ?? null);
		if (x !== y) lines.push(`${key}\n  first:  ${x}\n  second: ${y}`);
	}
	return lines;
};

const [first, second] = process.argv.slice(2);
if (!first) throw new Error('base URL required');
const actual = await table(first.replace(/\/$/, ''));
if (second === '--record') {
	writeFileSync(GOLDEN, JSON.stringify(actual, null, 1) + '\n');
	console.log(`recorded ${Object.keys(actual).length} answers from ${first} → ${GOLDEN}`);
} else {
	const expected = second
		? await table(second.replace(/\/$/, ''))
		: (JSON.parse(readFileSync(GOLDEN, 'utf8')) as Record<string, Answer>);
	const lines = second ? diff(actual, expected) : diff(expected, actual);
	console.log(`${Object.keys(actual).length} answers, ${lines.length} differ`);
	if (lines.length) {
		console.log(lines.join('\n'));
		process.exit(1);
	}
}
