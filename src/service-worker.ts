/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, prerendered, version } from '$service-worker';

import { LANGUAGES } from './lib/languages';

// Service worker: makes Koenami installable and keeps the shell fast. The build's hashed
// files are cached at install (their names change on every deploy, and the cache is named
// by the build, so activating a new one drops the last build's copies); pages and root
// files go network first so a deploy shows up immediately and the last copy still opens
// offline. Audio samples and the analysis API are never cached: they are large, and
// analysis needs the server anyway.
const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `koenami-${version}`;
// The other languages' pages sit under /<lang>/; the Japanese page is the root.
const others = LANGUAGES.filter((lang) => lang !== 'ja').join('|');
const shellPage = new RegExp(
	`^/((${others})/)?$|^/(guide|tutorial|method|references)\\.html$|site\\.webmanifest$`
);
// The public pages and the other languages' manifests among the prerendered paths (the
// result page, the research library and the curation pages are not shell), the Japanese
// manifest from the static files, and the root files the installed app opens with.
const SHELL = [
	...prerendered.filter((path) => shellPage.test(path)),
	'/site.webmanifest',
	'/language.js',
	'/theme.js',
	'/favicon.svg',
	'/icon-192.png'
];
// The studio is one document per language; /ja/ duplicates the root.
const languageRoot = new RegExp(`^/(${others})$`);
const pageKey = (url: URL) =>
	/^\/ja\/?$/.test(url.pathname) ? '/' : url.pathname.replace(languageRoot, '/$1/');
const immutable = (url: URL) => url.pathname.startsWith('/_app/immutable/');

// Each file is fetched on its own, so one that fails to load keeps the rest cached.
sw.addEventListener('install', (e) => {
	e.waitUntil(
		caches
			.open(CACHE)
			.then((c) => Promise.all([...build, ...SHELL].map((path) => c.add(path).catch(() => {}))))
			.then(() => sw.skipWaiting())
	);
});
sw.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});
sw.addEventListener('fetch', (e) => {
	const { request } = e;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== location.origin) return;
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/samples/')) return;
	if (immutable(url)) {
		e.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(request);
				if (hit) return hit;
				const res = await fetch(request);
				if (res.ok) await c.put(request, res.clone());
				return res;
			})
		);
		return;
	}
	const page = request.mode === 'navigate';
	e.respondWith(
		caches.open(CACHE).then(async (c) => {
			try {
				const res = await fetch(request);
				if (res.ok) await c.put(page ? new Request(pageKey(url)) : request, res.clone());
				return res;
			} catch (err) {
				const hit = await c.match(page ? pageKey(url) : request, { ignoreSearch: true });
				if (hit) return hit;
				throw err;
			}
		})
	);
});
