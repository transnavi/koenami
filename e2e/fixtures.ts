import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, expect, type Page } from '@playwright/test';

import { domProjection, storageDump, type Observation } from './observe';

export { expect, type Page };
export const record = process.env.RECORD === '1';
export const root = fileURLToPath(new URL('..', import.meta.url));
// The old tree calls the analyzer; the new one measures in the page, so the two
// make different requests and draw different live tracks. Each keeps its own set.
export const tree = process.env.KOENAMI_TREE === 'new' ? 'new' : 'old';
/** Element ids whose state follows a live measurement. Live readouts summarise the pitch
 *  track over a window measured in captured samples, so their numbers shift with real
 *  capture timing; on the new tree the measurement itself is of the fake device's audio
 *  rather than a recorded response, so the verdict it feeds follows it too. */
/** Element ids that show a captured take's measurement; masked on the new tree with
 *  `maskAudio` for the reason given where it is applied. */
export const measuredIgnore: readonly string[] = [
	'indicators',
	'fit-value',
	'report-button',
	'verdict-readout',
	'verdict-main',
	'verdict-word',
	'verdict-number',
	'verdict-gate',
	'verdict-dot',
	'share-verdict',
	'share-score'
];
export const liveIgnore: readonly string[] = [
	'indicators',
	'fit-value',
	'report-button',
	'quality-state',
	'live-mode',
	'live-time',
	...(tree === 'new'
		? [
				'verdict-readout',
				'verdict-main',
				'verdict-word',
				'verdict-number',
				'verdict-dot',
				'share-verdict',
				'share-score'
			]
		: [])
];
export const goldenDir = join(root, tree === 'new' ? 'tests/golden/e2e-new' : 'tests/golden/e2e');
export const fixtureAudio = (name: string) => join(root, 'tests/fixtures/audio', name);

const START = Date.UTC(2026, 0, 1, 3, 0, 0); // 2026-01-01 12:00 JST

type NetEntry = {
	seq: number;
	method: string;
	path: string;
	query: string;
	body?: string;
	status?: number;
};
const masked = '<audio>';
type Studio = {
	log: NetEntry[];
	/** Golden a named observation of the page. `ignore` drops element ids whose state
	 *  follows real-time media playback and cannot be pinned. */
	golden: (
		name: string,
		options?: { ignore?: readonly string[]; maskAudio?: boolean; extra?: Record<string, unknown> }
	) => Promise<void>;
	/** Advance the fake clock, letting timers, intervals and animation frames run. */
	tick: (ms?: number) => Promise<void>;
	/** Wait (real time) until a page expression is truthy. The fake clock does not move,
	 *  so page time advances only through tick(); that keeps timer-driven state identical
	 *  between runs. */
	until: (expression: string, timeoutMs?: number) => Promise<void>;
	/** Wait until every logged API request has been answered. */
	settled: () => Promise<void>;
	/** Like until(), but advances the fake clock 50 ms per poll for flows driven by
	 *  timers and real audio together (A/B comparison). The number of ticks depends on
	 *  timing, so a fixed tick should follow before any golden. */
	untilTicking: (expression: string, timeoutMs?: number) => Promise<void>;
	/** Pixel-exact PNG golden of one canvas, from the canvas's own pixels. */
	canvas: (name: string, selector: string) => Promise<void>;
	/** Download triggered by `action`, recorded as name + SHA-256. */
	download: (
		action: () => Promise<void>
	) => Promise<{ name: string; sha256: string; bytes: number }>;
	/** Choose a value in a koe-select by clicking its popover item. */
	choose: (id: string, value: string) => Promise<void>;
	/** Click a row action (download, delete) of a koe-select menu entry. */
	rowAction: (id: string, value: string, action: string) => Promise<void>;
	/** Full page navigation to the studio with the harness installed. The first-visit
	 *  guide is marked done unless `tour` asks for it. */
	open: (
		path?: string,
		before?: (page: Page) => Promise<unknown>,
		options?: { tour?: boolean }
	) => Promise<void>;
	/** History navigation with coverage preserved. */
	back: () => Promise<void>;
	forward: () => Promise<void>;
	/** Absolute path of an audio fixture. */
	audio: (name: string) => string;
	/** A hold on the studio's measurements. The old tree posts audio to the analyzer, so
	 *  the hold intercepts `/api/analyze`; the new tree measures in the page, so it is
	 *  `window.voiceApp.measure`, the engine's own gate. Either way: hold the next take
	 *  or live window until released, fail the next one with a message, or reshape every
	 *  answer of a kind with a function given as source (it runs in the page on the new
	 *  tree and on the recorded response on the old). */
	measure: {
		hold: (kind?: MeasureKind) => Promise<() => Promise<void>>;
		/** Fails the next measurement, or every one until `restore` when `times` is Infinity.
		 *  `network` fails it the way a dropped connection does: the old tree's request is
		 *  aborted (and the browser's own message, "Failed to fetch", is what the app shows),
		 *  the new tree's engine fails with `message`. */
		fail: (
			message: string,
			kind?: MeasureKind,
			options?: { status?: number; times?: number; network?: boolean }
		) => Promise<void>;
		restore: (kind?: MeasureKind) => Promise<void>;
		patch: (kind: MeasureKind, source: string | null) => Promise<void>;
	};
};
/** `take` is a recorded or imported take (or a range of one), `live` a live window. */
export type MeasureKind = 'take' | 'live';

async function install(page: Page) {
	await page.addInitScript(() => {
		let uuid = 0;
		crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;
		let seed = 0x2f6e2b1;
		Math.random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 0x100000000;
		};
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
	coverage: [
		async ({ page }, use) => {
			await page.coverage.startJSCoverage({ resetOnNavigation: false });
			const entries: Awaited<ReturnType<typeof page.coverage.stopJSCoverage>> = [];
			flushers.set(page, async () => {
				entries.push(...(await page.coverage.stopJSCoverage()));
				await page.coverage.startJSCoverage({ resetOnNavigation: false });
			});
			await use();
			entries.push(...(await page.coverage.stopJSCoverage()));
			flushers.delete(page);
			const dir = join(root, 'coverage/e2e/raw');
			mkdirSync(dir, { recursive: true });
			const name = `${sha(Buffer.from(test.info().titlePath.join(' > ')))}.json`;
			writeFileSync(join(dir, name), JSON.stringify({ result: entries }));
		},
		{ auto: true }
	],

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
			if (url.pathname.startsWith('/samples/')) {
				media.add(url.pathname);
				return;
			}
			if (!/^\/(api|data)\//.test(url.pathname)) return;
			const body = request.postDataBuffer();
			const entry = {
				seq: ++seq,
				method: request.method(),
				path: url.pathname,
				// oxlint-disable-next-line require-array-sort-compare -- pairs sort by their default string form; the recorded keys depend on it
				query: [...url.searchParams]
					.sort()
					.map(([k, v]) => `${k}=${v}`)
					.join('&'),
				body: body ? `${body.length}b ${sha(body)}` : undefined
			};
			entries.set(request, entry);
			log.push(entry);
		});
		page.on('response', (response) => {
			const entry = entries.get(response.request());
			if (entry) entry.status = response.status();
		});
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));

		// Layout, font and media events arrive in real time: ResizeObserver callbacks after
		// a panel changes size, font loading that reflows text, media metadata after a
		// source is set. A short real pause before the fake frames lets them land in the
		// same order whether the API answered quickly (replay) or slowly (recording
		// against the analyzer); the app exposes no hook for these events.
		const settle = async () => {
			await page.waitForTimeout(60);
			await page.evaluate(() => document.fonts.ready).catch(() => {});
		};
		const tick = async (ms = 100) => {
			await settle();
			await page.clock.runFor(ms);
		};
		const until = async (expression: string, timeoutMs = 30_000) => {
			const started = Date.now();
			while (!(await page.evaluate(expression))) {
				if (Date.now() - started > timeoutMs)
					throw new Error(
						`timed out waiting for ${expression}; notice: ${await page
							.locator('#notice')
							.innerText({ timeout: 500 })
							.catch(() => '')}`
					);
				await page.waitForTimeout(25);
			}
		};
		const settled = async () => {
			const started = Date.now();
			while (log.some((e) => e.status === undefined)) {
				if (Date.now() - started > 30_000)
					throw new Error('timed out waiting for pending requests');
				await page.waitForTimeout(25);
			}
			await page.waitForTimeout(25);
		};
		const untilTicking = async (expression: string, timeoutMs = 30_000) => {
			const started = Date.now();
			while (!(await page.evaluate(expression))) {
				if (Date.now() - started > timeoutMs)
					throw new Error(`timed out waiting for ${expression}`);
				await page.clock.runFor(50);
				await page.waitForTimeout(20);
			}
		};
		const golden = async (
			name: string,
			{
				ignore = [],
				maskAudio = false,
				extra = {}
			}: { ignore?: readonly string[]; maskAudio?: boolean; extra?: Record<string, unknown> } = {}
		) => {
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
				for (const entry of observation.network)
					if (entry.method === 'POST' && entry.path === '/api/analyze' && entry.body)
						entry.body = masked;
				// The old tree's analyzer answered a captured take from a recording keyed by
				// its length, so its measurement was the same on every run; the new tree
				// measures the captured samples themselves, so everything derived from them
				// follows the microphone too.
				if (tree === 'new') for (const id of measuredIgnore) dom.elements[id] = { ignored: true };
				const measured = tree === 'new' ? ['features', 'detail', 'measurement', 'quality'] : [];
				const strip = (value: unknown): unknown => {
					if (Array.isArray(value)) return value.map(strip);
					if (value && typeof value === 'object')
						return Object.fromEntries(
							Object.entries(value).map(([k, v]) => [
								k,
								k === 'waveform' ||
								measured.includes(k) ||
								(['sha256', 'duration', 'length'].includes(k) &&
									v !== null &&
									typeof v !== 'object')
									? masked
									: strip(v)
							])
						);
					return value;
				};
				const storage = observation.storage as {
					idb: Record<string, unknown>;
					local: Record<string, unknown>;
				};
				for (const key of Object.keys(storage.idb))
					if (key.startsWith('recording') || key === 'takes')
						storage.idb[key] = strip(storage.idb[key]);
				if (storage.local['koenami-session'])
					storage.local['koenami-session'] = strip(storage.local['koenami-session']);
			}
			const path = join(dir, `${name}.json`);
			const text = JSON.stringify(observation, null, 1) + '\n';
			if (record) {
				writeFileSync(path, text);
				return;
			}
			if (!existsSync(path)) throw new Error(`missing golden ${file}/${name}; run with RECORD=1`);
			const expected = readFileSync(path, 'utf8');
			if (text !== expected) {
				// Every later golden of the test is still compared; the actual observation is
				// kept next to the test's output for diffing.
				const out = info.outputPath(`${name}.actual.json`);
				mkdirSync(info.outputPath(), { recursive: true });
				writeFileSync(out, text);
				expect
					.soft(JSON.parse(text), `golden ${file}/${name} (actual: ${out})`)
					.toEqual(JSON.parse(expected));
			}
		};
		// The canvas's own pixels, encoded by the page: a screenshot of the element would
		// include the controls composited over it, whose rounded corners rasterise with
		// ±1 differences between runs.
		const canvas = async (name: string, selector: string) => {
			await settle();
			const data = await page
				.locator(selector)
				.evaluate((el) => (el as HTMLCanvasElement).toDataURL('image/png'));
			expect(Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')).toMatchSnapshot(
				`${name}.png`
			);
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
			await page
				.locator(`#${id} button.trigger`)
				.and(page.locator('[aria-expanded="false"]'))
				.waitFor();
		};
		// Init scripts stay attached to the page, so a test may install them once; a second
		// `before` would silently stack on the first.
		let prepared = false;
		let tourSkipped = false;
		const flush = async () => {
			await flushers.get(page)?.();
		};
		// The pinned tree is wired at the load event; the Kit tree wires its pages on hydration.
		const ready = async () => {
			if (process.env.KOENAMI_TREE === 'new')
				await page.waitForSelector('html[data-hydrated]', { state: 'attached' });
		};
		const back = async () => {
			await flush();
			await page.goBack();
			await ready();
		};
		const forward = async () => {
			await flush();
			await page.goForward();
			await ready();
		};
		const rowAction = async (id: string, value: string, action: string) => {
			await page.locator(`#${id} button.trigger`).click();
			await page
				.locator(`#${id} button.row-action[data-value="${value}"][data-action="${action}"]`)
				.click();
			await page.locator(`#${id} button.trigger[aria-expanded="false"]`).waitFor();
		};
		const open = async (
			path = '/ja/',
			before?: (page: Page) => Promise<unknown>,
			options: { tour?: boolean } = {}
		) => {
			await flush();
			await install(page);
			// The guide starts on every first visit; scenarios that are not about it skip it.
			if (options.tour && tourSkipped)
				throw new Error(
					'open(): the guide was already marked done in this test; give the tour its own test'
				);
			if (!options.tour && !tourSkipped) {
				tourSkipped = true;
				await page.addInitScript(() => {
					try {
						if (!localStorage.getItem('voice-tour'))
							localStorage.setItem('voice-tour', JSON.stringify({ done: true }));
					} catch {}
				});
			}
			if (before) {
				if (prepared) throw new Error('open(): only one before() per test; split the scenario');
				prepared = true;
				await before(page);
			}
			await page.goto(path);
			await ready();
		};
		// Measurement holds, per tree (see the Studio type).
		const routeOf = (kind?: MeasureKind) =>
			kind === 'live'
				? '**/api/analyze?live=1'
				: kind === 'take'
					? '**/api/analyze'
					: '**/api/analyze**';
		const engineKind = (kind?: MeasureKind) =>
			kind === 'live' ? 'live' : kind === 'take' ? 'analyze' : undefined;
		const measure: Studio['measure'] = {
			hold: async (kind) => {
				if (tree === 'new') {
					await page.evaluate((k) => {
						const w = window as unknown as {
							voiceApp: { measure: { hold: (kind?: string) => () => void } };
							__release?: Record<string, () => void>;
						};
						(w.__release ??= {})[k ?? '*'] = w.voiceApp.measure.hold(k);
					}, engineKind(kind));
					return () =>
						page.evaluate((k) => {
							const w = window as unknown as { __release?: Record<string, () => void> };
							w.__release?.[k ?? '*']?.();
							delete w.__release?.[k ?? '*'];
						}, engineKind(kind));
				}
				let release: (() => void) | null = null;
				const held = new Promise<void>((resolve) => {
					release = resolve;
				});
				await page.route(
					routeOf(kind),
					async (route) => {
						await held;
						await route.continue();
					},
					{ times: 1 }
				);
				return async () => release!();
			},
			fail: async (message, kind, { status = 503, times = 1, network = false } = {}) => {
				if (tree === 'new') {
					await page.evaluate(
						([m, k, n]) =>
							(
								window as unknown as {
									voiceApp: {
										measure: { fail: (message: string, kind?: string, times?: number) => void };
									};
								}
							).voiceApp.measure.fail(m, k, n === null ? Infinity : n),
						[message, engineKind(kind), Number.isFinite(times) ? times : null] as const
					);
					return;
				}
				await page.route(
					routeOf(kind),
					(route) =>
						network
							? route.abort('connectionfailed')
							: route.fulfill({ status, contentType: 'text/plain; charset=utf-8', body: message }),
					Number.isFinite(times) ? { times } : undefined
				);
			},
			restore: async (kind) => {
				if (tree === 'new') {
					await page.evaluate(
						(k) =>
							(
								window as unknown as { voiceApp: { measure: { restore: (kind?: string) => void } } }
							).voiceApp.measure.restore(k),
						engineKind(kind)
					);
					return;
				}
				await page.unroute(routeOf(kind));
			},
			patch: async (kind, source) => {
				if (tree === 'new') {
					await page.evaluate(
						([k, s]) =>
							(
								window as unknown as {
									voiceApp: { measure: { patch: (kind: string, fn: unknown) => void } };
								}
							).voiceApp.measure.patch(
								k,
								// The patch is test-authored source (see the Studio type), built in the page.
								// oxlint-disable-next-line no-implied-eval
								s ? new Function('return ' + s)() : null
							),
						[engineKind(kind)!, source] as const
					);
					return;
				}
				await page.unroute(routeOf(kind));
				if (!source) return;
				// oxlint-disable-next-line no-implied-eval
				const fn = new Function('return ' + source)() as (detail: unknown) => unknown;
				await page.route(routeOf(kind), async (route) => {
					const response = await route.fetch();
					await route.fulfill({ response, json: fn(await response.json()) });
				});
			}
		};
		await use({
			log,
			golden,
			tick,
			until,
			untilTicking,
			settled,
			canvas,
			download,
			choose,
			rowAction,
			open,
			back,
			forward,
			audio: fixtureAudio,
			measure
		});
	}
});

// Playwright's snapshot comparison writes new files only with --update-snapshots;
// RECORD=1 maps onto that in the npm scripts.
