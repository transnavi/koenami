// Worker runtime types are checked separately by check:worker; keep them out of the DOM tests.
import { Container } from '@cloudflare/containers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VoiceAnalyzer } from '../../worker/analyzer.ts';

// The container library itself runs here, over a Durable Object state whose container is
// already healthy and whose port answers with whatever the test hands it.
async function analyzer(port) {
	const stored = new Map([['__CF_CONTAINER_STATE', { status: 'healthy', lastChange: 0 }]]);
	const container = {
		running: false,
		getTcpPort: () => ({ fetch: port }),
		monitor: () => new Promise(() => {})
	};
	let constructed = Promise.resolve();
	const object = new VoiceAnalyzer(
		{
			id: 'analyzer',
			container,
			storage: {
				kv: { get: () => undefined },
				sql: { exec: () => [] },
				get: async (key) => stored.get(key),
				put: async (key, value) => void stored.set(key, value),
				setAlarm: async () => {},
				sync: async () => {}
			},
			blockConcurrencyWhile: (work) => (constructed = work())
		},
		{}
	);
	await constructed;
	container.running = true;
	return object;
}
// What the container's port resolves with: the runtime's response always has a `webSocket`.
function answer(body, init) {
	return Object.defineProperty(new Response(body, init), 'webSocket', { value: null });
}
function stream(chunks, { close = true, fail, onCancel } = {}) {
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
			if (fail) controller.error(fail);
			else if (close) controller.close();
		},
		cancel: onCancel
	});
}
const turn = () => new Promise((resolve) => setTimeout(resolve));
const post = (init = {}) =>
	new Request('http://localhost:8080/api/analyze?lang=en', {
		method: 'POST',
		body: new Uint8Array(8),
		...init
	});

// A body cut short rejects the library's own pipe, which nothing awaits; the runtime only
// logs that, so the rejections are collected here in place of failing the run.
let reported, rejections;
beforeEach(() => {
	vi.stubGlobal('IdentityTransformStream', TransformStream);
	vi.spyOn(console, 'error').mockImplementation(() => {});
	reported = process.listeners('unhandledRejection');
	rejections = [];
	process.removeAllListeners('unhandledRejection');
	process.on('unhandledRejection', (reason) => rejections.push(reason));
});
afterEach(async () => {
	await turn();
	process.removeAllListeners('unhandledRejection');
	for (const listener of reported) process.on('unhandledRejection', listener);
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('analyzer responses', () => {
	it('holds the container awake while a response nobody reads is passed through', async () => {
		const object = await analyzer(async () => answer(stream(['{"f0":', '220}'])));
		await Container.prototype.fetch.call(object, post());
		await turn();
		expect(object.inflightRequests).toBe(1);
	});

	it('leaves nothing in flight when the caller never reads the response', async () => {
		const object = await analyzer(async () => answer(stream(['{"f0":', '220}'])));
		await object.fetch(post());
		expect(object.inflightRequests).toBe(0);
		expect(rejections).toEqual([]);
	});

	it('returns the status, headers and whole body of the container response', async () => {
		const object = await analyzer(async () =>
			answer(stream(['{"error":', '"too quiet"}']), {
				status: 422,
				statusText: 'Unprocessable Entity',
				headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '2' }
			})
		);
		const response = await object.fetch(post());
		expect(response.status).toBe(422);
		expect(response.statusText).toBe('Unprocessable Entity');
		expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
		expect(response.headers.get('Retry-After')).toBe('2');
		expect(await response.text()).toBe('{"error":"too quiet"}');
	});

	it('sends the request to the container port as it arrived', async () => {
		const port = vi.fn(async () => answer('{}'));
		const object = await analyzer(port);
		const audio = Uint8Array.from([1, 2, 3, 4]);
		await object.fetch(post({ body: audio, headers: { 'Accept-Language': 'ko' } }));
		const [url, request] = port.mock.calls[0];
		expect(url).toBe('http://localhost:8080/api/analyze?lang=en');
		expect(request.method).toBe('POST');
		expect(request.headers.get('Accept-Language')).toBe('ko');
		expect(new Uint8Array(await request.arrayBuffer())).toEqual(audio);
	});

	it('passes a response without a body through', async () => {
		const object = await analyzer(async () => answer(null, { status: 204 }));
		const response = await object.fetch(
			new Request('http://localhost:8080/api/health', { method: 'HEAD' })
		);
		expect(response.status).toBe(204);
		expect(response.body).toBeNull();
		expect(object.inflightRequests).toBe(0);
	});

	it("keeps the library's own answer when the container connection drops", async () => {
		const object = await analyzer(async () => {
			throw new Error('Network connection lost.');
		});
		const response = await object.fetch(post());
		expect(response.status).toBe(500);
		expect(await response.text()).toBe('Container suddenly disconnected, try again');
		expect(object.inflightRequests).toBe(0);
	});
});

describe('analyzer time limit', () => {
	it('gives up on a body that stalls and lets go of the container', async () => {
		const onCancel = vi.fn();
		const object = await analyzer(async () =>
			answer(stream(['{"f0":'], { close: false, onCancel }))
		);
		object.responseTimeoutMs = 20;
		const response = await object.fetch(post({ headers: { 'Accept-Language': 'en' } }));
		expect(response.status).toBe(504);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.text()).toBe('Try again in a moment.');
		await turn();
		expect(onCancel).toHaveBeenCalledOnce();
		expect(object.inflightRequests).toBe(0);
	});

	it('gives up on a container that never answers, in the language asked for', async () => {
		const port = vi.fn(
			(_url, request) =>
				new Promise((_resolve, reject) =>
					request.signal.addEventListener('abort', () => reject(request.signal.reason))
				)
		);
		const object = await analyzer(port);
		object.responseTimeoutMs = 20;
		const response = await object.fetch(post({ headers: { 'Accept-Language': 'ja' } }));
		expect(response.status).toBe(504);
		expect(await response.text()).toBe('少し待ってからお試しください。');
		expect(object.inflightRequests).toBe(0);
	});

	it('stops reading when the caller goes away', async () => {
		const onCancel = vi.fn();
		const object = await analyzer(async () =>
			answer(stream(['{"f0":'], { close: false, onCancel }))
		);
		const caller = new AbortController();
		const pending = object.fetch(post({ signal: caller.signal }));
		await turn();
		expect(object.inflightRequests).toBe(1);
		caller.abort();
		expect((await pending).status).toBe(504);
		await turn();
		expect(onCancel).toHaveBeenCalledOnce();
		expect(object.inflightRequests).toBe(0);
	});

	it('answers within the limit when the body arrives in time', async () => {
		const object = await analyzer(async () => answer(stream(['{"f0":220}'])));
		object.responseTimeoutMs = 20;
		const response = await object.fetch(post());
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('{"f0":220}');
	});
});

describe('analyzer read failures', () => {
	it('reports a body that breaks off as a bad gateway', async () => {
		let source;
		const body = new ReadableStream({ start: (controller) => void (source = controller) });
		const object = await analyzer(async () => answer(body));
		const pending = object.fetch(post({ headers: { 'Accept-Language': 'en' } }));
		await turn();
		source.enqueue(new TextEncoder().encode('{"f0":'));
		source.error(new Error('Network connection lost.'));
		const response = await pending;
		expect(response.status).toBe(502);
		expect(await response.text()).toBe('Try again in a moment.');
		expect(object.inflightRequests).toBe(0);
	});
});
