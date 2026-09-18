// Explores the studio's UI state graph on one tree and writes it as a transition table:
// from the cold start, every operation the page offers is applied, the abstract state it
// leads to and the hash of the full DOM projection there are recorded, and every new
// abstract state is explored in turn, up to a depth. Each edge is reached by replaying
// its path in a fresh browser context, so a state's operations never see what another
// operation left behind. Two tables are then compared by e2e/model/compare.ts.
//
//   node --experimental-strip-types e2e/model/explore.ts <port> <out.json> [depth] [max states]
//
// The mock server on <port> serves the tree (tests/mock-api/server.mjs with
// MOCK_API_STATIC); the page setup is the characterization harness's (deterministic ids
// and random numbers, the clock installed and paused, the guide marked done, recordings
// capped at two seconds). MODEL_JOBS pages run at once (default 2); MODEL_ROOT_OPS, a
// comma-separated list of operation names, narrows the cold start's operations to one
// corner of the graph.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { chromium, type Browser, type Page } from '@playwright/test';

import { domProjection, maskAudio } from '../observe.ts';
import {
	abstractState,
	enabledOperations,
	operationName,
	type AbstractState,
	type Edge,
	type Node,
	type Operation,
	type Table
} from './state.ts';

const [port, out, depthArg, maxArg] = process.argv.slice(2);
const depth = Number(depthArg || 2);
const maxStates = Number(maxArg || 80);
const jobs = Number(process.env.MODEL_JOBS || 2);
const rootOps = process.env.MODEL_ROOT_OPS?.split(',');
const START = Date.UTC(2026, 0, 15, 3, 0, 0);
const audio = (name: string) => `${process.cwd()}/tests/fixtures/audio/${name}`;

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
	// A recording stops on its own after the catalog's cap; two seconds makes its length
	// independent of real time, as the record scenarios do.
	await page.route('**/api/catalog', async (route) => {
		const response = await route.fetch();
		const catalog = (await response.json()) as { capabilities: { maxSeconds: number } };
		catalog.capabilities.maxSeconds = 2;
		await route.fulfill({ response, json: catalog });
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
// has held still for three steps and nothing is running, or until a bound (a capped
// recording with its analysis takes a few seconds of real time, more under load).
async function settle(page: Page): Promise<number> {
	let last = '';
	let still = 0;
	for (let i = 0; i < 240; i++) {
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
	return 240;
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

// The projection, with what derives from microphone samples masked as the goldens mask
// it, and the page's origin named alike for every tree.
const projectionHash = async (page: Page) => {
	const p = await page.evaluate(domProjection);
	maskAudio(p);
	return sha(JSON.stringify(p).replaceAll(`http://127.0.0.1:${port}`, 'http://test-origin'));
};

// Replays a path and applies one more operation; every failure lands in the edge's
// note, naming the step that failed, and the context always closes.
async function edge(browser: Browser, node: Node, op: Operation): Promise<Edge> {
	const page = await open(browser);
	let note: string | undefined;
	try {
		try {
			for (const [i, step] of node.path.entries()) {
				try {
					await apply(page, step);
				} catch (e) {
					throw new Error(`step ${i + 1} of ${node.path.length}: ${String(e).split('\n')[0]}`, {
						cause: e
					});
				}
				await settle(page);
			}
			await apply(page, op);
		} catch (e) {
			note = `failed at ${String(e).split('\n')[0].slice(0, 200)}`;
		}
		const steps = await settle(page);
		const state = await page.evaluate(abstractState);
		const projection = await projectionHash(page);
		return { from: node.key, op: operationName(op), to: keyOf(state), projection, steps, note };
	} finally {
		await page.context().close();
	}
}

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

const table: Table = { port, depth, truncated: false, nodes: [], edges: [] };
const nodes = new Map<string, Node>();
const queue: Node[] = [];
const save = () => {
	table.nodes = [...nodes.values()];
	writeFileSync(out, JSON.stringify(table, null, 1));
};
{
	const page = await open(browser);
	try {
		const state = await page.evaluate(abstractState);
		const node = { key: keyOf(state), state, path: [], projection: await projectionHash(page) };
		nodes.set(node.key, node);
		queue.push(node);
	} finally {
		await page.context().close();
	}
}
const started = Date.now();
while (queue.length) {
	const node = queue.shift()!;
	if (node.path.length >= depth) continue;
	// The operations are read once at the node, in name order so that the states found
	// first (and kept under the cap) do not depend on the page's element order.
	let ops: Operation[];
	{
		const page = await open(browser);
		try {
			for (const step of node.path) {
				await apply(page, step);
				await settle(page);
			}
			ops = await page.evaluate(enabledOperations);
		} finally {
			await page.context().close();
		}
	}
	ops.sort((a, b) => operationName(a).localeCompare(operationName(b)));
	if (node.path.length === 0 && rootOps) {
		const names = new Set(ops.map(operationName));
		for (const name of rootOps)
			if (!names.has(name))
				throw new Error(`MODEL_ROOT_OPS: no operation ${name} at the cold start`);
		ops = ops.filter((op) => rootOps.includes(operationName(op)));
	}
	console.log(
		`[${nodes.size} states, ${table.edges.length} edges, ${Math.round((Date.now() - started) / 1000)} s] depth ${node.path.length}: ${ops.length} operations from ${summary(node.state)}`
	);
	// The edges of a node run a few at a time; their results are taken in operation order.
	const results: Edge[] = Array.from({ length: ops.length });
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(jobs, ops.length) }, async () => {
			while (next < ops.length) {
				const i = next++;
				results[i] = await edge(browser, node, ops[i]);
			}
		})
	);
	for (const [i, e] of results.entries()) {
		table.edges.push(e);
		if (nodes.has(e.to)) continue;
		if (nodes.size >= maxStates) {
			table.truncated = true;
			continue;
		}
		const found = {
			key: e.to,
			state: JSON.parse(e.to) as AbstractState,
			path: [...node.path, ops[i]],
			projection: e.projection
		};
		nodes.set(e.to, found);
		queue.push(found);
	}
	save();
}
await browser.close();
console.log(
	`done: ${nodes.size} states${table.truncated ? ' (cap reached)' : ''}, ${table.edges.length} edges in ${Math.round((Date.now() - started) / 1000)} s → ${out}`
);

function summary(s: AbstractState) {
	return `${s.phase}/${s.reference}/${s.own}/takes ${s.takes}${s.dialogs.length ? '/dialog ' + s.dialogs.join('+') : ''}${s.menu ? '/menu ' + s.menu : ''}${s.sheet ? '/sheet' : ''}`;
}
