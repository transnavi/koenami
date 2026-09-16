// Stand-in for the Python analyzer on port 35511. It serves recorded responses from
// tests/fixtures/api and the audio under tests/fixtures/data/samples, so browser runs
// see identical API output on every machine.
//
//   node tests/mock-api/server.mjs                 replay
//   MOCK_API_RECORD=http://127.0.0.1:35512 node tests/mock-api/server.mjs
//                                                  proxy to a real server.py and save every answer
//
// Fixture key: METHOD path?sorted-query [sha256(body)]. Recordings of the microphone
// vary with capture timing, so POST /api/analyze also stores a copy keyed by the
// sample count rounded to half a second, which replay falls back to.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fixtures = join(root, 'tests/fixtures/api');
const samples = join(root, 'tests/fixtures/data/samples');
const upstream = process.env.MOCK_API_RECORD;
const port = Number(process.env.MOCK_API_PORT || 35511);
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
	if (req.method === 'GET' && url.pathname.startsWith('/samples/')) {
		const path = join(samples, basename(url.pathname));
		if (!existsSync(path)) { res.writeHead(404); return res.end('no sample'); }
		const type = path.endsWith('.mp3') ? 'audio/mpeg' : path.endsWith('.flac') ? 'audio/flac' : 'audio/wav';
		res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
		return res.end(readFileSync(path));
	}
	const body = await readBody(req);
	const candidates = keys(req.method, url, body);
	if (upstream) {
		const answer = await record(req, url, body);
		for (const key of candidates) writeFileSync(file(key), JSON.stringify({ key, ...answer }, null, 1) + '\n');
		return send(res, answer);
	}
	for (const key of candidates) {
		if (existsSync(file(key))) return send(res, JSON.parse(readFileSync(file(key), 'utf8')));
	}
	console.error(`mock-api: no fixture for ${candidates[0]}`);
	res.writeHead(599, { 'content-type': 'text/plain; charset=utf-8' });
	res.end(`no fixture for ${candidates[0]}`);
}).listen(port, '127.0.0.1', () => console.log(`mock-api ${upstream ? 'recording from ' + upstream : 'replaying'} on ${port}`));
