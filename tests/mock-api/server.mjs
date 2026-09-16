// Test server for the browser suite. It serves the app's own files from web/ exactly
// as committed (so coverage ranges line up with the unit layer), recorded API responses
// from tests/fixtures/api, and the audio under tests/fixtures/data/samples.
//
//   node tests/mock-api/server.mjs                 replay
//   MOCK_API_RECORD=http://127.0.0.1:35512 node tests/mock-api/server.mjs
//                                                  proxy API calls to a real server.py and save every answer
//   MOCK_API_STATIC=web                            directory served for page and script requests (default web)
//
// Fixture key: METHOD path?sorted-query [sha256(body)]. Recordings of the microphone
// vary with capture timing, so POST /api/analyze also stores a copy keyed by the
// sample count rounded to half a second, which replay falls back to.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(root, 'tests/fixtures/api');
const samples = join(root, 'tests/fixtures/data/samples');
const upstream = process.env.MOCK_API_RECORD;
const port = Number(process.env.MOCK_API_PORT || 35511);
const site = join(root, process.env.MOCK_API_STATIC || 'web');
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', ico: 'image/x-icon', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8', json: 'application/json' };
// Routes as worker.ts serves them: the studio at / and /<lang>/, pages and scripts by
// name, and everything in web/public at the root.
function staticFile(pathname) {
	if (pathname === '/' || /^\/(ja|zh-CN|en|ko)\/?$/.test(pathname)) return join(site, 'index.html');
	const name = pathname.slice(1);
	if (!name || name.includes('..')) return null;
	for (const candidate of [join(site, name), join(site, 'public', name)]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	return null;
}
mkdirSync(fixtures, { recursive: true });

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const safe = (s) => s.replace(/[^A-Za-z0-9._-]+/g, '_');
function keys(method, url, body) {
	const query = [...url.searchParams].sort().map(([k, v]) => `${k}=${v}`).join('&');
	const base = `${method} ${url.pathname}${query ? '?' + query : ''}`;
	const list = [];
	if (body.length) list.push(`${base} ${sha(body)}`);
	else list.push(base);
	if (method === 'POST' && url.pathname === '/api/analyze') {
		const halfSeconds = Math.round(body.length / 4 / 16000 / 0.5);
		list.push(`${base} samples~${halfSeconds * 0.5}s`);
	}
	return list;
}
const file = (key) => join(fixtures, safe(key) + '.json');

function readBody(req) {
	return new Promise((resolve) => {
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks)));
	});
}
function send(res, record) {
	res.writeHead(record.status, { 'content-type': record.contentType, 'cache-control': 'no-store' });
	res.end(record.base64 ? Buffer.from(record.body, 'base64') : record.body);
}
async function record(req, url, body) {
	const response = await fetch(upstream + url.pathname + url.search, {
		method: req.method, body: body.length ? body : undefined,
		headers: { host: '127.0.0.1', 'content-type': req.headers['content-type'] || 'application/octet-stream' }
	});
	const contentType = response.headers.get('content-type') || 'application/octet-stream';
	const bytes = Buffer.from(await response.arrayBuffer());
	const text = /json|text/.test(contentType);
	return { status: response.status, contentType, body: text ? bytes.toString('utf8') : bytes.toString('base64'), base64: !text };
}

createServer(async (req, res) => {
	const url = new URL(req.url, 'http://localhost');
	if ((req.method === 'GET' || req.method === 'HEAD') && !/^\/(api|samples|data)\//.test(url.pathname)) {
		// The production build bundles this dependency; served unbundled, the bare
		// specifier needs an import map.
		if (url.pathname.startsWith('/node_modules/@zip.js/')) {
			const path = join(root, url.pathname.slice(1));
			if (!existsSync(path)) { res.writeHead(404); return res.end(); }
			res.writeHead(200, { 'content-type': types.js, 'cache-control': 'no-store' });
			return res.end(readFileSync(path));
		}
		const path = staticFile(url.pathname);
		if (!path) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
		let body = readFileSync(path);
		if (path.endsWith('.html')) body = Buffer.from(body.toString('utf8').replace('<head>', '<head><script type="importmap">{"imports":{"@zip.js/zip.js/index-native.js":"/node_modules/@zip.js/zip.js/index-native.js"}}</script>'));
		res.writeHead(200, { 'content-type': types[path.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-store' });
		return res.end(req.method === 'HEAD' ? undefined : body);
	}
	if (req.method === 'GET' && url.pathname.startsWith('/samples/')) {
		const path = join(samples, basename(url.pathname));
		if (!existsSync(path)) { res.writeHead(404); return res.end('no sample'); }
		const type = path.endsWith('.mp3') ? 'audio/mpeg' : path.endsWith('.flac') ? 'audio/flac' : 'audio/wav';
		// Range requests, as aiohttp's FileResponse answers them; without them Chromium
		// reports an infinite duration and cannot seek.
		const bytes = readFileSync(path);
		const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
		if (range) {
			const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
			const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
			res.writeHead(206, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': end - start + 1 });
			return res.end(bytes.subarray(start, end + 1));
		}
		res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes', 'content-length': bytes.length });
		return res.end(bytes);
	}
	const body = await readBody(req);
	const candidates = keys(req.method, url, body);
	// Microphone captures never repeat byte for byte, so once a fixture exists for a
	// sample-count bucket every later capture of that length gets the same answer, in
	// recording runs as well as replays. Exact-body fixtures (uploads) are looked up first.
	for (const key of candidates) {
		if (existsSync(file(key))) return send(res, JSON.parse(readFileSync(file(key), 'utf8')));
	}
	// A capture that rounds to a bucket nobody recorded (timing on a slow machine) gets the
	// nearest recorded bucket of the same endpoint rather than failing the run.
	const bucket = candidates.find((k) => k.includes(' samples~'));
	if (bucket && !upstream) {
		const [base] = bucket.split(' samples~');
		const want = Number(bucket.split(' samples~')[1]);
		const nearest = readdirSync(fixtures).map((name) => { try { return JSON.parse(readFileSync(join(fixtures, name), 'utf8')).key; } catch { return ''; } })
			.filter((k) => k.startsWith(base + ' samples~')).map((k) => ({ k, d: Math.abs(Number(k.split(' samples~')[1]) - want) })).sort((a, b) => a.d - b.d)[0];
		if (nearest) { console.error(`mock-api: ${bucket} → ${nearest.k}`); return send(res, JSON.parse(readFileSync(file(nearest.k), 'utf8'))); }
	}
	if (upstream) {
		let answer;
		try { answer = await record(req, url, body); } catch (error) {
			console.error(`mock-api: upstream failed for ${candidates[0]}: ${error.message}`);
			res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
			return res.end('upstream failed');
		}
		for (const key of candidates) writeFileSync(file(key), JSON.stringify({ key, ...answer }, null, 1) + '\n');
		return send(res, answer);
	}
	console.error(`mock-api: no fixture for ${candidates[0]}`);
	res.writeHead(599, { 'content-type': 'text/plain; charset=utf-8' });
	res.end(`no fixture for ${candidates[0]}`);
}).listen(port, '127.0.0.1', () => console.log(`mock-api ${upstream ? 'recording from ' + upstream : 'replaying'} on ${port}`));
