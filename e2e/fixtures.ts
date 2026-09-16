import { test as base, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { domProjection, storageDump, type Observation } from './observe';

export { expect, type Page };
export const record = process.env.RECORD === '1';
export const root = fileURLToPath(new URL('..', import.meta.url));
export const goldenDir = join(root, 'tests/golden/e2e');
export const fixtureAudio = (name: string) => join(root, 'tests/fixtures/audio', name);

const START = Date.UTC(2026, 0, 1, 3, 0, 0); // 2026-01-01 12:00 JST

type NetEntry = { seq: number; method: string; path: string; query: string; body?: string; status?: number };
const masked = '<audio>';
type Studio = {
	log: NetEntry[];
	/** Golden a named observation of the page. `ignore` drops element ids whose state
	 *  follows real-time media playback and cannot be pinned. */
	golden: (name: string, options?: { ignore?: readonly string[]; maskAudio?: boolean; extra?: Record<string, unknown> }) => Promise<void>;
	/** Advance the fake clock, letting timers, intervals and animation frames run. */
	tick: (ms?: number) => Promise<void>;
	/** Wait (real time) until a page expression is truthy. The fake clock does not move,
	 *  so page time advances only through tick(); that keeps timer-driven state identical
	 *  between runs. */
	until: (expression: string, timeoutMs?: number) => Promise<void>;
	/** Like until(), but advances the fake clock 50 ms per poll for flows driven by
	 *  timers and real audio together (A/B comparison). The number of ticks depends on
	 *  timing, so a fixed tick should follow before any golden. */
	untilTicking: (expression: string, timeoutMs?: number) => Promise<void>;
	/** Pixel-exact screenshot golden of one element. */
	canvas: (name: string, selector: string) => Promise<void>;
	/** Download triggered by `action`, recorded as name + SHA-256. */
	download: (action: () => Promise<void>) => Promise<{ name: string; sha256: string; bytes: number }>;
	/** Choose a value in a koe-select by clicking its popover item. */
	choose: (id: string, value: string) => Promise<void>;
	/** Full page navigation to the studio with the harness installed. */
	open: (path?: string, before?: (page: Page) => Promise<unknown>) => Promise<void>;
	/** History navigation with coverage preserved. */
	back: () => Promise<void>;
	forward: () => Promise<void>;
	/** Absolute path of an audio fixture. */
	audio: (name: string) => string;
};

async function install(page: Page) {
	await page.addInitScript(() => {
		let uuid = 0;
		crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`;
		let seed = 0x2f6e2b1;
		Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
		Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
	});
	// Installed and paused: page time moves only through tick(), so Date.now(), timers
	// and animation frames are identical on every run. The pause target sits a few
	// seconds after the install time, which real time cannot have passed yet.
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 5000);
}

const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const flushers = new WeakMap<Page, () => Promise<void>>();

export const test = base.extend<{ studio: Studio; coverage: void }>({
	// V8 only reports scripts that are still alive, so coverage is flushed before every
	// navigation (see `flush` in the studio fixture) and written once per test.
	coverage: [async ({ page }, use) => {
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		const entries: Awaited<ReturnType<typeof page.coverage.stopJSCoverage>> = [];
		flushers.set(page, async () => { entries.push(...(await page.coverage.stopJSCoverage())); await page.coverage.startJSCoverage({ resetOnNavigation: false }); });
		await use();
		entries.push(...(await page.coverage.stopJSCoverage()));
		flushers.delete(page);
		const dir = join(root, 'coverage/e2e/raw');
		mkdirSync(dir, { recursive: true });
		const name = `${sha(Buffer.from(test.info().titlePath.join(' > ')))}.json`;
		writeFileSync(join(dir, name), JSON.stringify({ result: entries }));
	}, { auto: true }],

	studio: async ({ page }, use, info) => {
		const log: NetEntry[] = [];
		const file = basename(info.file).replace(/\.spec\.ts$/, '');
		const dir = join(goldenDir, file);
		mkdirSync(dir, { recursive: true });
		let seq = 0;
		// Media elements fetch /samples in a variable number of range requests, so those
		// are kept as the set of files touched rather than as log entries.
		const media = new Set<string>();
		const entries = new WeakMap<import('@playwright/test').Request, NetEntry>();
		page.on('request', (request) => {
			const url = new URL(request.url());
			if (url.pathname.startsWith('/samples/')) { media.add(url.pathname); return; }
			if (!/^\/(api|data)\//.test(url.pathname)) return;
			const body = request.postDataBuffer();
			const entry = { seq: ++seq, method: request.method(), path: url.pathname, query: [...url.searchParams].sort().map(([k, v]) => `${k}=${v}`).join('&'), body: body ? `${body.length}b ${sha(body)}` : undefined };
			entries.set(request, entry);
			log.push(entry);
		});
		page.on('response', (response) => { const entry = entries.get(response.request()); if (entry) entry.status = response.status(); });
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));

		// Layout, font and media events arrive in real time: ResizeObserver callbacks after
		// a panel changes size, font loading that reflows text, media metadata after a
		// source is set. A short real pause before the fake frames lets them land in the
		// same order whether the API answered quickly (replay) or slowly (recording
		// against the analyzer); the app exposes no hook for these events.
		const settle = async () => { await page.waitForTimeout(60); await page.evaluate(() => document.fonts.ready).catch(() => {}); };
		const tick = async (ms = 100) => { await settle(); await page.clock.runFor(ms); };
		const until = async (expression: string, timeoutMs = 30_000) => {
			const started = Date.now();
			while (!(await page.evaluate(expression))) {
				if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${expression}; notice: ${await page.locator('#notice').innerText({ timeout: 500 }).catch(() => '')}`);
				await page.waitForTimeout(25);
			}
		};
		const untilTicking = async (expression: string, timeoutMs = 30_000) => {
			const started = Date.now();
			while (!(await page.evaluate(expression))) {
				if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${expression}`);
				await page.clock.runFor(50);
				await page.waitForTimeout(20);
			}
		};
		const golden = async (name: string, { ignore = [], maskAudio = false, extra = {} }: { ignore?: readonly string[]; maskAudio?: boolean; extra?: Record<string, unknown> } = {}) => {
			const dom = await page.evaluate(domProjection);
			for (const id of ignore) dom.elements[id] = { ignored: true };
			let observation: Observation & { network: NetEntry[]; media: string[]; errors: string[] } = {
				...dom,
				storage: await page.evaluate(storageDump),
				network: log.slice(),
				media: [...media].sort(),
				errors: errors.slice(),
				...extra
			};
			// Microphone audio differs between runs (the fake device loops its file from
			// launch). Only what derives from the captured samples is masked: the bodies of
			// analysis requests and the sample-dependent fields of stored recordings.
			if (maskAudio) {
				for (const entry of observation.network) if (entry.method === 'POST' && entry.path === '/api/analyze' && entry.body) entry.body = masked;
				const strip = (value: unknown): unknown => {
					if (Array.isArray(value)) return value.map(strip);
					if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'waveform' || (['sha256', 'duration', 'length'].includes(k) && v !== null && typeof v !== 'object') ? masked : strip(v)]));
					return value;
				};
				const storage = observation.storage as { idb: Record<string, unknown>; local: Record<string, unknown> };
				for (const key of Object.keys(storage.idb)) if (key.startsWith('recording:') || key === 'takes') storage.idb[key] = strip(storage.idb[key]);
				if (storage.local['koenami-session']) storage.local['koenami-session'] = strip(storage.local['koenami-session']);
			}
			const path = join(dir, `${name}.json`);
			const text = JSON.stringify(observation, null, 1) + '\n';
			if (record) { writeFileSync(path, text); return; }
			if (!existsSync(path)) throw new Error(`missing golden ${file}/${name}; run with RECORD=1`);
			const expected = readFileSync(path, 'utf8');
			if (text !== expected) {
				// Every later golden of the test is still compared; the actual observation is
				// kept next to the test's output for diffing.
				const out = info.outputPath(`${name}.actual.json`);
				mkdirSync(info.outputPath(), { recursive: true });
				writeFileSync(out, text);
				expect.soft(JSON.parse(text), `golden ${file}/${name} (actual: ${out})`).toEqual(JSON.parse(expected));
			}
		};
		const canvas = async (name: string, selector: string) => {
			await settle();
			await expect(page.locator(selector)).toHaveScreenshot(`${name}.png`, { animations: 'disabled', caret: 'hide' });
		};
		const download = async (action: () => Promise<void>) => {
			const waiting = page.waitForEvent('download');
			await action();
			const download = await waiting;
			const stream = await download.createReadStream();
			const chunks: Buffer[] = [];
			for await (const chunk of stream) chunks.push(chunk as Buffer);
			const buffer = Buffer.concat(chunks);
			return { name: download.suggestedFilename(), sha256: sha(buffer), bytes: buffer.length };
		};
		const choose = async (id: string, value: string) => {
			await page.locator(`#${id} button.trigger`).click();
			await page.locator(`#${id} button.item[data-value="${value}"]`).click();
		};
		// Init scripts stay attached to the page, so a test may install them once; a second
		// `before` would silently stack on the first.
		let prepared = false;
		const flush = async () => { await flushers.get(page)?.(); };
		const back = async () => { await flush(); await page.goBack(); };
		const forward = async () => { await flush(); await page.goForward(); };
		const open = async (path = '/ja/', before?: (page: Page) => Promise<unknown>) => {
			await flush();
			await install(page);
			if (before) {
				if (prepared) throw new Error('open(): only one before() per test; split the scenario');
				prepared = true;
				await before(page);
			}
			await page.goto(path);
		};
		await use({ log, golden, tick, until, untilTicking, canvas, download, choose, open, back, forward, audio: fixtureAudio });
	}
});

// Playwright's screenshot comparison writes new snapshots only with --update-snapshots;
// RECORD=1 maps onto that in the npm scripts.
