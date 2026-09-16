import { test as base, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';
import { domProjection, storageDump, type Observation } from './observe';

export { expect };
export const record = process.env.RECORD === '1';
export const root = fileURLToPath(new URL('..', import.meta.url));
export const goldenDir = join(root, 'tests/golden/e2e');
export const fixtureAudio = (name: string) => join(root, 'tests/fixtures/audio', name);

const START = Date.UTC(2026, 0, 1, 3, 0, 0); // 2026-01-01 12:00 JST

type NetEntry = { seq: number; method: string; path: string; query: string; body?: string; status?: number };
type Studio = {
	log: NetEntry[];
	/** Golden a named observation of the page. `ignore` drops element ids whose state
	 *  follows real-time media playback and cannot be pinned. */
	golden: (name: string, options?: { ignore?: string[]; maskAudio?: boolean; extra?: Record<string, unknown> }) => Promise<void>;
	/** Advance the fake clock, letting timers, intervals and animation frames run. */
	tick: (ms?: number) => Promise<void>;
	/** Wait (real time) until a page expression is truthy. The fake clock does not move,
	 *  so page time advances only through tick(); that keeps timer-driven state identical
	 *  between runs. */
	until: (expression: string, timeoutMs?: number) => Promise<void>;
	/** Pixel-exact screenshot golden of one element. */
	canvas: (name: string, selector: string) => Promise<void>;
	/** Download triggered by `action`, recorded as name + SHA-256. */
	download: (action: () => Promise<void>) => Promise<{ name: string; sha256: string; bytes: number }>;
	/** Choose a value in a koe-select by clicking its popover item. */
	choose: (id: string, value: string) => Promise<void>;
	/** Full page navigation to the studio with the harness installed. */
	open: (path?: string, before?: (page: Page) => Promise<void>) => Promise<void>;
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
	// and animation frames are identical on every run.
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START);
}

const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

export const test = base.extend<{ studio: Studio; coverage: void }>({
	coverage: [async ({ page }, use) => {
		await page.coverage.startJSCoverage({ resetOnNavigation: false });
		await use();
		const entries = await page.coverage.stopJSCoverage();
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
		page.on('request', (request) => {
			const url = new URL(request.url());
			if (!/^\/(api|samples|data)\//.test(url.pathname)) return;
			const body = request.postDataBuffer();
			log.push({ seq: ++seq, method: request.method(), path: url.pathname, query: [...url.searchParams].sort().map(([k, v]) => `${k}=${v}`).join('&'), body: body ? `${body.length}b ${sha(body)}` : undefined });
		});
		page.on('response', (response) => {
			const url = new URL(response.url());
			const entry = log.find((e) => e.status === undefined && e.path === url.pathname && e.method === response.request().method());
			if (entry) entry.status = response.status();
		});
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(String(error)));

		const tick = async (ms = 100) => { await page.clock.runFor(ms); };
		const until = async (expression: string, timeoutMs = 30_000) => {
			const started = Date.now();
			while (!(await page.evaluate(expression))) {
				if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${expression}; notice: ${await page.locator('#notice').innerText().catch(() => '')}`);
				await page.waitForTimeout(25);
			}
		};
		const golden = async (name: string, { ignore = [], maskAudio = false, extra = {} }: { ignore?: string[]; maskAudio?: boolean; extra?: Record<string, unknown> } = {}) => {
			const dom = await page.evaluate(domProjection);
			for (const id of ignore) dom.elements[id] = { ignored: true };
			let observation: Observation & { network: NetEntry[]; errors: string[] } = {
				...dom,
				storage: await page.evaluate(storageDump),
				network: log.slice(),
				errors: errors.slice(),
				...extra
			};
			// Microphone audio differs between runs (the fake device loops its file from
			// launch); hashes of captured samples and their analysis bodies are masked.
			if (maskAudio) observation = JSON.parse(JSON.stringify(observation, (key, value) => ['sha256', 'body', 'waveform', 'duration', 'length'].includes(key) && value !== null ? '<audio>' : value));
			const path = join(dir, `${name}.json`);
			const text = JSON.stringify(observation, null, 1) + '\n';
			if (record) { writeFileSync(path, text); return; }
			if (!existsSync(path)) throw new Error(`missing golden ${file}/${name}; run with RECORD=1`);
			expect(text, `golden ${file}/${name}`).toBe(readFileSync(path, 'utf8'));
		};
		const canvas = async (name: string, selector: string) => {
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
		const open = async (path = '/ja/', before?: (page: Page) => Promise<void>) => {
			await install(page);
			if (before) await before(page);
			await page.goto(path);
		};
		await use({ log, golden, tick, until, canvas, download, choose, open, audio: fixtureAudio });
	}
});

// Playwright's screenshot comparison writes new snapshots only with --update-snapshots;
// RECORD=1 maps onto that in the npm scripts.
