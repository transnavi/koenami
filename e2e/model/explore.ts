// Explores the studio's UI state graph on one tree and writes it as a transition table:
// from the cold start, every operation the page offers is applied, the abstract state it
// leads to and the hash of the full DOM projection there are recorded, and every new
// abstract state is explored in turn, up to a depth. Each edge is reached by replaying
// its path in a fresh browser context, so a state's operations never see what another
// operation left behind. Two tables (tests/scripts/model-compare.ts) are then compared.
//
//   node --experimental-strip-types e2e/model/explore.ts <port> <out.json> [depth] [max states]
//
// The mock server on <port> serves the tree (tests/mock-api/server.mjs with
// MOCK_API_STATIC); the page setup is the characterization harness's (deterministic
// ids and random numbers, the clock installed and paused, the guide marked done).
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { chromium, type Browser, type Page } from '@playwright/test';

import { domProjection } from '../observe.ts';
import {
	abstractState,
	enabledOperations,
	operationName,
	type AbstractState,
	type Operation
} from './state.ts';

const [port, out, depthArg, maxArg] = process.argv.slice(2);
const depth = Number(depthArg || 2);
const maxStates = Number(maxArg || 80);
const START = Date.UTC(2026, 0, 15, 3, 0, 0);
const audio = (name: string) => `${process.cwd()}/tests/fixtures/audio/${name}`;

type Edge = {
	from: string;
	op: string;
	to: string;
	projection: string;
	steps: number;
	note?: string;
};
type Node = { key: string; state: AbstractState; path: Operation[]; projection: string };

const keyOf = (s: AbstractState) => JSON.stringify(s);
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

async function open(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		viewport: { width: 1440, height: 960 },
		deviceScaleFactor: 1,
		locale: 'ja-JP',
		timezoneId: 'Asia/Tokyo',
		colorScheme: 'light',
		reducedMotion: 'reduce',
		permissions: ['microphone'],
		bypassCSP: true
	});
	const page = await context.newPage();
	await page.addInitScript(() => {
		let uuid = 0;
		crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`;
		let seed = 0x2f6e2b1;
		Math.random = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 0x100000000;
		};
		Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
		try {
			localStorage.setItem('voice-tour', JSON.stringify({ done: true }));
		} catch {}
	});
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 5000);
	await page.goto(`http://127.0.0.1:${port}/ja/`);
	await page.waitForFunction(
		'!!window.voiceApp?.state.refFull && !window.voiceApp.state.loadingLanguage',
		null,
		{ timeout: 30_000 }
	);
	await settle(page);
	return page;
}

// Lets the page finish what an operation started: fake time advances in steps (real
// time passes a little each step for media and layout events) until the abstract state
// has held still for three steps and nothing is running, or until a bound.
async function settle(page: Page): Promise<number> {
	let last = '';
	let still = 0;
	for (let i = 0; i < 80; i++) {
		await page.waitForTimeout(60);
		await page.evaluate(() => document.fonts.ready).catch(() => {});
		await page.clock.runFor(250);
		const s = await page.evaluate(abstractState);
		const k = keyOf(s);
		const running = s.phase === 'busy' || s.phase === 'analysing' || s.phase === 'loading';
		still = k === last && !running ? still + 1 : 0;
		last = k;
		if (still >= 3) return i;
	}
	return 80;
}

async function apply(page: Page, op: Operation) {
	switch (op.kind) {
		case 'click': {
			const isSelect = await page
				.locator(`#${op.id}`)
				.evaluate((el) => el.tagName === 'KOE-SELECT');
			await page
				.locator(isSelect ? `#${op.id} button.trigger` : `#${op.id}`)
				.click({ timeout: 5000 });
			return;
		}
		case 'key':
			await page.keyboard.press(op.key);
			return;
		case 'upload':
			await page.locator(`#${op.id}`).setInputFiles(audio(op.file));
			return;
		case 'choose':
			await page
				.locator(`#${op.id} button.item[data-value="${op.value}"]`)
				.click({ timeout: 5000 });
			return;
		case 'row':
			await page.locator('.sample-row').nth(op.index).click({ timeout: 5000 });
			return;
		case 'dismiss':
			await page.mouse.click(2, 2);
			return;
	}
}

const projectionHash = async (page: Page) => {
	const p = await page.evaluate(domProjection);
	// Timers are masked by the projection itself; the page's origin (in share links) is
	// named alike for every tree, as the goldens name it.
	return sha(JSON.stringify(p).replaceAll(`http://127.0.0.1:${port}`, 'http://test-origin'));
};

const browser = await chromium.launch({
	channel: 'chromium',
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
		`--use-file-for-fake-audio-capture=${audio('microphone.wav')}`,
		'--autoplay-policy=no-user-gesture-required',
		'--font-render-hinting=none',
		'--disable-lcd-text',
		'--force-device-scale-factor=1',
		'--disable-gpu'
	]
});

const nodes = new Map<string, Node>();
const edges: Edge[] = [];
const queue: Node[] = [];
{
	const page = await open(browser);
	const state = await page.evaluate(abstractState);
	const node = { key: keyOf(state), state, path: [], projection: await projectionHash(page) };
	nodes.set(node.key, node);
	queue.push(node);
	await page.context().close();
}
const started = Date.now();
while (queue.length) {
	const node = queue.shift()!;
	if (node.path.length >= depth) continue;
	// The operations are read once at the node; a fresh page per edge then replays the
	// path and applies one of them.
	let ops: Operation[];
	{
		const page = await open(browser);
		for (const step of node.path) {
			await apply(page, step);
			await settle(page);
		}
		ops = await page.evaluate(enabledOperations);
		await page.context().close();
	}
	// MODEL_ROOT_OPS narrows the cold start's operations (a comma-separated list of names)
	// to explore one corner of the graph, or one edge twice.
	if (node.path.length === 0 && process.env.MODEL_ROOT_OPS)
		ops = ops.filter((op) => process.env.MODEL_ROOT_OPS!.split(',').includes(operationName(op)));
	console.log(
		`[${nodes.size} states, ${edges.length} edges, ${Math.round((Date.now() - started) / 1000)} s] depth ${node.path.length}: ${ops.length} operations from ${summary(node.state)}`
	);
	for (const op of ops) {
		const page = await open(browser);
		let note: string | undefined;
		try {
			for (const step of node.path) {
				await apply(page, step);
				await settle(page);
			}
			await apply(page, op);
		} catch (e) {
			note = `failed: ${String(e).split('\n')[0].slice(0, 160)}`;
		}
		const steps = await settle(page);
		const state = await page.evaluate(abstractState);
		const key = keyOf(state);
		const projection = await projectionHash(page);
		edges.push({ from: node.key, op: operationName(op), to: key, projection, steps, note });
		if (!nodes.has(key) && nodes.size < maxStates) {
			const next = { key, state, path: [...node.path, op], projection };
			nodes.set(key, next);
			queue.push(next);
		}
		await page.context().close();
	}
	writeFileSync(out, JSON.stringify({ port, depth, nodes: [...nodes.values()], edges }, null, 1));
}
await browser.close();
console.log(
	`done: ${nodes.size} states, ${edges.length} edges in ${Math.round((Date.now() - started) / 1000)} s → ${out}`
);

function summary(s: AbstractState) {
	return `${s.phase}/${s.reference}/${s.own}/takes ${s.takes}${s.dialogs.length ? '/dialog ' + s.dialogs.join('+') : ''}${s.menu ? '/menu ' + s.menu : ''}${s.sheet ? '/sheet' : ''}`;
}
