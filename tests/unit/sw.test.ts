import { beforeAll, describe, it, vi } from 'vitest';

import { golden } from './golden';

// The service worker runs in its own global scope; these stand-ins record what it does.
const ORIGIN = 'https://koe.test';
const abs = (url: string) => new URL(url, ORIGIN).href;
type Init = { method?: string; mode?: string };
class FakeRequest {
	url: string;
	method: string;
	mode: string;
	constructor(url: string, init: Init = {}) {
		this.url = abs(url);
		this.method = init.method || 'GET';
		this.mode = init.mode || 'cors';
	}
}
type Req = FakeRequest | string;
const keyOf = (r: Req, ignoreSearch = false) => {
	const u = new URL(typeof r === 'string' ? abs(r) : r.url);
	if (ignoreSearch) u.search = '';
	return u.href;
};

const html = (body: string) => () =>
	new Response(body, { headers: { 'content-type': 'text/html' } });
const indexHtml = html(
	'<script src="/assets/app-abc.js"></script><link href=\'/assets/style-1.css\'>url(/assets/img.png)'
);
const responses: Record<string, () => Response> = {
	'/': indexHtml,
	'/ja/': indexHtml,
	'/guide.html': html('<p>guide</p>'),
	'/tutorial.html': html('<p>tutorial</p>'),
	'/method.html': html('<p>method</p>'),
	'/site.webmanifest': () =>
		new Response('{}', { headers: { 'content-type': 'application/manifest+json' } }),
	'/favicon.svg': () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
	'/icon-192.png': () => new Response(null),
	'/assets/app-abc.js': () =>
		new Response('app', { headers: { 'content-type': 'text/javascript' } }),
	'/assets/old-zzz.js': () =>
		new Response('old', { headers: { 'content-type': 'text/javascript' } }),
	'/robots.txt': () => new Response('down', { status: 500 })
};
let online = true;
const fetchStub = vi.fn(async (req: FakeRequest) => {
	if (!online) throw new Error('offline');
	return (responses[new URL(req.url).pathname] || (() => new Response('nope', { status: 404 })))();
});
class FakeCache {
	store = new Map<string, Response>();
	// Keys the cache lists but cannot match, as after a partial eviction.
	phantom: string[] = [];
	async keys() {
		return [...this.store.keys(), ...this.phantom].map((u) => new FakeRequest(u));
	}
	async match(r: Req, opts: { ignoreSearch?: boolean } = {}) {
		if (!opts.ignoreSearch) return this.store.get(keyOf(r));
		for (const [k, v] of this.store) if (keyOf(k, true) === keyOf(r, true)) return v;
		return undefined;
	}
	async put(r: Req, res: Response) {
		this.store.set(keyOf(r), res);
	}
	async delete(r: Req) {
		return this.store.delete(keyOf(r));
	}
	async addAll(urls: string[]) {
		for (const u of urls) this.store.set(abs(u), await fetchStub(new FakeRequest(u)));
	}
}
const caches = new Map<string, FakeCache>([['koenami-v0', new FakeCache()]]);
const cacheStorage = {
	open: async (name: string) => {
		if (!caches.has(name)) caches.set(name, new FakeCache());
		return caches.get(name)!;
	},
	keys: async () => [...caches.keys()],
	delete: async (name: string) => caches.delete(name)
};
type Handler = (event: {
	request?: FakeRequest;
	respondWith?: (p: Promise<Response>) => void;
	waitUntil: (p: Promise<unknown>) => void;
}) => void;
const handlers: Record<string, Handler> = {};
const skipWaiting = vi.fn(async () => {});
const claim = vi.fn(async () => {});
vi.stubGlobal('addEventListener', (type: string, handler: Handler) => {
	handlers[type] = handler;
});
vi.stubGlobal('skipWaiting', skipWaiting);
vi.stubGlobal('clients', { claim });
vi.stubGlobal('caches', cacheStorage);
vi.stubGlobal('fetch', fetchStub);
vi.stubGlobal('location', { origin: ORIGIN });
vi.stubGlobal('Request', FakeRequest);

const lifecycle = async (type: string) => {
	const waits: Promise<unknown>[] = [];
	handlers[type]({ waitUntil: (p) => waits.push(p) });
	await Promise.all(waits);
};
const request = async (url: string, init: Init = {}) => {
	const waits: Promise<unknown>[] = [];
	let response: Promise<Response> | null = null;
	handlers.fetch({
		request: new FakeRequest(url, init),
		respondWith: (p) => {
			response = p;
		},
		waitUntil: (p) => waits.push(p)
	});
	const outcome = response
		? await (response as Promise<Response>).then(
				(r) => String(r.status),
				(e: Error) => `error: ${e.message}`
			)
		: 'passthrough';
	await Promise.all(waits);
	return outcome;
};
const cached = () =>
	[...(caches.get('koenami-v1')?.store.keys() ?? [])].map((u) => u.replace(ORIGIN, '')).sort();

// The Kit tree gets a service worker shaped by its own build ($service-worker) together with
// the studio; its golden is recorded then.
describe.skipIf((process.env.KOENAMI_TREE || 'old') === 'new')('service worker', () => {
	// @ts-expect-error the worker registers its listeners and exports nothing
	beforeAll(() => import('@app/public/sw'));
	it('caches the shell, hashed assets and pages, serves them offline, and prunes what no page references', async () => {
		const log: unknown[] = [['handlers', Object.keys(handlers).sort()]];
		await lifecycle('install');
		log.push(['installed', cached(), skipWaiting.mock.calls.length]);
		await lifecycle('activate');
		log.push(['activated', [...caches.keys()], claim.mock.calls.length]);
		const requests: [string, Init?][] = [
			['/api/analyze', { method: 'POST' }],
			['https://elsewhere.test/x'],
			['/api/catalog'],
			['/samples/a.wav'],
			['/assets/app-abc.js'],
			['/assets/app-abc.js'],
			['/assets/old-zzz.js'],
			['/assets/missing.js'],
			['/ja/?utm=1', { mode: 'navigate' }],
			['/guide.html', { mode: 'navigate' }],
			['/site.webmanifest'],
			['/robots.txt']
		];
		for (const [url, init] of requests) {
			if (url === '/guide.html') caches.get('koenami-v1')!.phantom.push(abs('/ghost.html'));
			log.push([
				init?.method || 'GET',
				url,
				init?.mode || 'cors',
				await request(url, init),
				cached(),
				fetchStub.mock.calls.length
			]);
		}
		online = false;
		for (const [url, init] of [
			['/en/', { mode: 'navigate' }],
			['/nope.html', { mode: 'navigate' }],
			['/site.webmanifest?v=2'],
			['/assets/app-abc.js'],
			['/assets/never.js']
		] as [string, Init?][]) {
			log.push(['offline', url, init?.mode || 'cors', await request(url, init), cached()]);
		}
		golden('sw.lifecycle', log);
	});
});
