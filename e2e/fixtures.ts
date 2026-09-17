import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base, expect, type Page } from '@playwright/test';

import { domProjection, storageDump, type Observation } from './observe';

export { expect, type Page };
export const record = process.env.RECORD === '1';
export const root = fileURLToPath(new URL('..', import.meta.url));
export const goldenDir = join(root, 'tests/golden/e2e');
export const fixtureAudio = (name: string) => join(root, 'tests/fixtures/audio', name);

const START = Date.UTC(2026, 0, 1, 3, 0, 0); // 2026-01-01 12:00 JST

type NetEntry = {
	seq: number;
	method: string;
	path: string;
	query: string;
	body?: string;
	status?: number | 'failed';
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
	screen: (name: string) => Promise<void>;
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
};

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

const port = Number(process.env.E2E_PORT || 8776);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

type Entry = Awaited<ReturnType<Page['coverage']['stopJSCoverage']>>[number];
type Fn = Entry['functions'][number];
// Coverage is taken in windows (after every golden and before every navigation), and each
// window reports the counts since it opened, as V8 block ranges: a function's range and,
// nested in it, the parts that ran a different number of times. Two windows cannot be
// added range by range, since a part that ran as often as its function has no range of
// its own in that window. Each window is laid out as a count per byte instead, the
// windows of one URL are summed (the instances that successive documents compile share
// the source), and one entry per URL is emitted with a range per stretch of equal counts.
const flat = new Set<string>();
function combine(entries: Entry[]): Entry[] {
	const byUrl = new Map<
		string,
		{ entry: Entry; fns: Map<string, { fn: Fn; counts: Int32Array; blocks: boolean }> }
	>();
	for (const entry of entries) {
		let kept = byUrl.get(entry.url);
		if (!kept) {
			kept = { entry, fns: new Map() };
			byUrl.set(entry.url, kept);
		}
		for (const fn of entry.functions) {
			const [outer] = fn.ranges;
			const id = `${outer.startOffset}-${outer.endOffset}`;
			let slot = kept.fns.get(id);
			if (!slot) {
				slot = { fn, counts: new Int32Array(outer.endOffset - outer.startOffset), blocks: false };
				kept.fns.set(id, slot);
			}
			// A window may report a function with its call count only, no block ranges. Laid
			// over the body, that count would credit every branch with runs it did not have,
			// so only the function's first byte (its call count) takes it; the branches inside
			// keep the counts of the windows that had block data, and the function is listed
			// so an exclusion inside it can say why its branches cannot be told apart.
			if (!fn.isBlockCoverage) {
				slot.counts[0] += outer.count;
				if (outer.count > 0)
					flat.add(`${entry.url.replace(/^.*\//, '')}:${fn.functionName || outer.startOffset}`);
				continue;
			}
			slot.blocks = true;
			// Ranges nest and come outermost first; a later range overrides the bytes it spans.
			const window = new Int32Array(outer.endOffset - outer.startOffset);
			for (const range of fn.ranges)
				window.fill(
					range.count,
					range.startOffset - outer.startOffset,
					range.endOffset - outer.startOffset
				);
			for (let i = 0; i < window.length; i++) slot.counts[i] += window[i];
		}
	}
	return [...byUrl.values()].map(({ entry, fns }) => ({
		...entry,
		functions: [...fns.values()].map(({ fn, counts, blocks }) => {
			const base = fn.ranges[0].startOffset;
			// A function no window saw with block data keeps the call count only.
			if (!blocks)
				return {
					...fn,
					ranges: [{ startOffset: base, endOffset: base + counts.length, count: counts[0] }],
					isBlockCoverage: false
				};
			const ranges: Fn['ranges'] = [
				{ startOffset: base, endOffset: base + counts.length, count: counts[0] }
			];
			// The outer range carries the count of the function's first byte (its calls); every
			// later stretch with another count becomes a nested range.
			let from = 1;
			for (let i = 2; i <= counts.length; i++) {
				if (i < counts.length && counts[i] === counts[from]) continue;
				if (counts[from] !== counts[0])
					ranges.push({ startOffset: base + from, endOffset: base + i, count: counts[from] });
				from = i;
			}
			// The per-byte layout is block data whatever the windows reported: a window that
			// gave the function's count only has it laid over the whole body.
			return { ...fn, ranges, isBlockCoverage: true };
		})
	}));
}
const flushers = new WeakMap<Page, () => Promise<void>>();

export const test = base.extend<{ studio: Studio; coverage: void }>({
	// V8 only reports scripts that are still alive, so coverage is flushed before every
	// navigation (see `flush` in the studio fixture) and written once per test.
	coverage: [
		async ({ page }, use) => {
			// Precise coverage is started once per page and read with Profiler.takePreciseCoverage,
			// which returns the counts since the last read and keeps the instrumentation: a stop
			// and restart (page.coverage's only way to read) puts functions compiled before the
			// restart back on call counts without block ranges. Script sources are collected as
			// the debugger reports them, since the converter needs them.
			const cdp = await page.context().newCDPSession(page);
			const sources = new Map<string, { url: string; source?: string }>();
			cdp.on('Debugger.scriptParsed', (event) => {
				if (event.url) sources.set(event.scriptId, { url: event.url });
			});
			await cdp.send('Debugger.enable');
			await cdp.send('Profiler.enable');
			await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
			const entries: Entry[] = [];
			const take = async () => {
				const { result } = await cdp.send('Profiler.takePreciseCoverage');
				for (const script of result) {
					const known = sources.get(script.scriptId);
					if (!known || !known.url) continue;
					if (known.source === undefined)
						known.source = await cdp
							.send('Debugger.getScriptSource', { scriptId: script.scriptId })
							.then((r) => r.scriptSource)
							.catch(() => '');
					entries.push({
						url: known.url,
						scriptId: script.scriptId,
						source: known.source,
						functions: script.functions
					});
				}
			};
			flushers.set(page, take);
			await use();
			await take().catch(() => {});
			await cdp.detach().catch(() => {});
			flushers.delete(page);
			const dir = join(root, 'coverage/e2e/raw');
			mkdirSync(dir, { recursive: true });
			const name = `${sha(Buffer.from(test.info().titlePath.join(' > ')))}.json`;
			const result = combine(entries);
			writeFileSync(join(dir, name), JSON.stringify({ result, flat: [...flat].sort() }));
			flat.clear();
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
		// A request the browser abandons gets no response, and one a document navigation
		// cancels may report nothing at all: both are logged as failed so the log settles.
		page.on('requestfailed', (request) => {
			const entry = entries.get(request);
			if (entry && entry.status === undefined) entry.status = 'failed';
		});
		// The entries in flight when a document navigation starts are the ones it abandons.
		// (Taking the leaving document's coverage here, with the document request held, was
		// tried: the coverage call waits on the renderer, which waits on the request.)
		page.on('request', (request) => {
			if (!request.isNavigationRequest() || request.frame() !== page.mainFrame()) return;
			for (const entry of log) if (entry.status === undefined) entry.status = 'failed';
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
			// analysis requests, the sample-dependent fields of stored recordings and the
			// waveform previews of the take menu.
			if (maskAudio) {
				for (const entry of observation.network)
					if (entry.method === 'POST' && entry.path === '/api/analyze' && entry.body)
						entry.body = masked;
				const strip = (value: unknown): unknown => {
					if (Array.isArray(value)) return value.map(strip);
					if (value && typeof value === 'object')
						return Object.fromEntries(
							Object.entries(value).map(([k, v]) => [
								k,
								k === 'waveform' ||
								k === 'peaks' ||
								k === 'data-peaks' ||
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
				// The waveform previews of the take menu are computed from the samples too.
				const elements = observation.elements;
				if (elements['take-select']) elements['take-select'] = strip(elements['take-select']);
				if (storage.local['koenami-session'])
					storage.local['koenami-session'] = strip(storage.local['koenami-session']);
			}
			const path = join(dir, `${name}.json`);
			// The pages build absolute links from their origin; the goldens name it by a
			// placeholder so the port the suite runs on is not part of them.
			const text =
				JSON.stringify(observation, null, 1).replaceAll(
					`http://127.0.0.1:${port}`,
					'http://test-origin'
				) + '\n';
			// The counts so far are taken with every golden: V8 drops the block counters of a
			// function that sits idle through the rest of a long scenario, and a count already
			// collected cannot be lost. Taking them is a round trip, so it comes after the
			// observation, which stays as it was recorded.
			await flush();
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
		// The rendered page, pixel for pixel. Two launches of the same page differ by a few
		// pixels at rounded corners (a channel off by 1 or 2 out of 255 from antialiasing),
		// so the comparison allows that colour distance and no differing pixel beyond it:
		// a moved element, a wrong colour or a changed font differs by far more. The live
		// timer is masked, and so are the map and signal canvases: their pixels have goldens
		// of their own, and a playback cursor on them follows real time.
		const screen = async (name: string) => {
			await settle();
			await page.evaluate(() => document.fonts.ready).catch(() => {});
			// A mask covers the element's box whatever lies over it, so the canvases are masked
			// only while no dialog is open above them; a dialog's screen shows the dialog.
			const covered = await page.locator('dialog[open]').count();
			const shot = await page.screenshot({
				fullPage: true,
				animations: 'disabled',
				caret: 'hide',
				mask: covered
					? [page.locator('#timer'), page.locator('#live-time')]
					: [
							page.locator('#timer'),
							page.locator('#live-time'),
							page.locator('#voice-map'),
							page.locator('#signal-canvas')
						]
			});
			expect(shot).toMatchSnapshot(`${name}.png`, { maxDiffPixels: 0, threshold: 0.02 });
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
			// Choosing a language navigates to its page; the coverage of the document that
			// leaves is taken first, since it is gone once the next one commits. The handler
			// itself runs after this point and is in no window (an exclusion names it).
			if (id === 'language') await flush();
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
		await use({
			log,
			golden,
			screen,
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
			audio: fixtureAudio
		});
	}
});

// Playwright's snapshot comparison writes new files only with --update-snapshots;
// RECORD=1 maps onto that in the npm scripts.
