/* The studio's side of the measurement worker, against a stand-in worker.
 *
 * What is pinned here is what the studio depends on when a listener moves
 * on mid-measurement or the engine fails to start: calls reach the worker
 * one at a time and in order, a call abandoned before its turn is never
 * posted, every call settles, and a worker that cannot start is replaced.
 * The module belongs to the SvelteKit tree, so the run against the pinned
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Posted = { id: number; kind: string };

class FakeWorker {
	static live: FakeWorker[] = [];
	posted: Posted[] = [];
	terminated = false;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message: string }) => void) | null = null;
	constructor() {
		FakeWorker.live.push(this);
	}
	postMessage(message: Posted) {
		this.posted.push(message);
	}
	terminate() {
		this.terminated = true;
	}
	answer(data: unknown) {
		this.onmessage?.({ data });
	}
	last() {
		return this.posted.at(-1)!;
	}
}

vi.mock('@app/measure/worker?worker', () => ({ default: FakeWorker }));

let engine: typeof import('@app/measure/engine');
const samples = () => new Float32Array([0, 0.5, -0.5, 0]);
const current = () => FakeWorker.live.at(-1)!;
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
	FakeWorker.live = [];
	vi.resetModules();
	engine = await import('@app/measure/engine');
});
afterEach(() => engine?.stop());

describe('the measurement engine', () => {
	it('posts one call at a time, in order, and answers each with its own result', async () => {
		const first = engine.analyze(samples());
		const second = engine.live(samples());
		expect(current().posted.map((m) => m.kind)).toEqual(['analyze']);
		current().answer({ id: current().last().id, json: '{"duration":1}' });
		expect(await first).toEqual({ duration: 1 });
		expect(current().posted.map((m) => m.kind)).toEqual(['analyze', 'live']);
		current().answer({ id: current().last().id, json: '{"duration":2}' });
		expect(await second).toEqual({ duration: 2 });
	});

	it('starts one worker and keeps it', async () => {
		const call = engine.version();
		// Left queued behind the version call; `stop()` fails it after the test.
		engine.analyze(samples()).catch(() => {});
		expect(FakeWorker.live).toHaveLength(1);
		current().answer({ id: current().last().id, json: '4.0.1' });
		expect(await call).toBe('4.0.1');
	});

	it('never posts a call abandoned before its turn', async () => {
		const busy = engine.analyze(samples());
		const controller = new AbortController();
		const queued = engine.live(samples(), controller.signal);
		controller.abort();
		await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
		current().answer({ id: current().last().id, json: '{}' });
		await busy;
		await settled();
		expect(current().posted.map((m) => m.kind)).toEqual(['analyze']);
	});

	it('drops the answer to a call abandoned in flight and moves on', async () => {
		const controller = new AbortController();
		const call = engine.live(samples(), controller.signal);
		const { id } = current().last();
		const following = engine.version();
		controller.abort();
		await expect(call).rejects.toMatchObject({ name: 'AbortError' });
		// The abandoned call's answer arrives after the next call was posted.
		expect(current().posted.map((m) => m.kind)).toEqual(['live', 'version']);
		current().answer({ id, json: '{"late":true}' });
		current().answer({ id: current().last().id, json: '4.0.1' });
		await expect(following).resolves.toBe('4.0.1');
	});

	it('refuses a call whose signal has already been aborted', async () => {
		await expect(engine.analyze(samples(), AbortSignal.abort())).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(FakeWorker.live).toHaveLength(0);
	});

	it('fails every call when the worker does, and starts a new one after', async () => {
		const first = engine.analyze(samples());
		const second = engine.live(samples());
		const failed = current();
		failed.onerror?.({ message: 'wasm failed to start' });
		await expect(first).rejects.toThrow('wasm failed to start');
		await expect(second).rejects.toThrow('wasm failed to start');
		expect(failed.terminated).toBe(true);
		const next = engine.version();
		expect(FakeWorker.live).toHaveLength(2);
		current().answer({ id: current().last().id, json: '4.0.1' });
		await expect(next).resolves.toBe('4.0.1');
	});

	it('replaces a worker whose module did not start, so a retry can succeed', async () => {
		const first = engine.analyze(samples());
		const queued = engine.version();
		const failed = current();
		failed.answer({ id: failed.last().id, error: 'fetch failed', fatal: true });
		await expect(first).rejects.toThrow('fetch failed');
		await expect(queued).rejects.toThrow('fetch failed');
		expect(failed.terminated).toBe(true);
		const retry = engine.analyze(samples());
		expect(FakeWorker.live).toHaveLength(2);
		current().answer({ id: current().last().id, json: '{"duration":1}' });
		await expect(retry).resolves.toEqual({ duration: 1 });
	});

	it('reports what the worker could not measure and continues', async () => {
		const call = engine.analyze(samples());
		const following = engine.version();
		current().answer({ id: current().last().id, error: 'Audio must contain finite samples.' });
		await expect(call).rejects.toThrow('Audio must contain finite samples.');
		current().answer({ id: current().last().id, json: '4.0.1' });
		await expect(following).resolves.toBe('4.0.1');
	});

	it('fails calls in flight when it is stopped', async () => {
		const call = engine.analyze(samples());
		engine.stop();
		await expect(call).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('keeps the caller’s samples', async () => {
		const pcm = samples();
		const call = engine.analyze(pcm);
		current().answer({ id: current().last().id, json: '{}' });
		await call;
		expect(Array.from(pcm)).toEqual([0, 0.5, -0.5, 0]);
	});

	it('refuses a channel count or rate the engine cannot use', async () => {
		await expect(engine.mono16(samples(), 0, 48000)).rejects.toThrow('whole number of channels');
		await expect(engine.mono16(samples(), 1.5, 48000)).rejects.toThrow('whole number of channels');
		await expect(engine.mono16(samples(), 2, 0)).rejects.toThrow('sample rate');
	});

	it('holds the next call for the browser suite until released', async () => {
		const release = engine.gate.hold('analyze');
		const call = engine.analyze(samples());
		await settled();
		expect(FakeWorker.live).toHaveLength(0);
		release();
		await settled();
		expect(current().posted.map((m) => m.kind)).toEqual(['analyze']);
		current().answer({ id: current().last().id, json: '{}' });
		await call;
		// The hold was consumed: the next call goes straight through (and is
		// left for `stop()` to fail after the test).
		engine.version().catch(() => {});
		await settled();
		expect(current().posted.map((m) => m.kind)).toEqual(['analyze', 'version']);
	});

	it('fails the next call of a kind on request, and lets the rest through', async () => {
		engine.gate.fail('解析サーバーを準備しています。', 'live');
		const take = engine.analyze(samples());
		current().answer({ id: current().last().id, json: '{}' });
		await expect(take).resolves.toEqual({});
		await expect(engine.live(samples())).rejects.toThrow('解析サーバー');
		const after = engine.live(samples());
		current().answer({ id: current().last().id, json: '{"active":true}' });
		await expect(after).resolves.toEqual({ active: true });
		// A standing failure lasts until restored.
		engine.gate.fail('busy', 'live', Infinity);
		await expect(engine.live(samples())).rejects.toThrow('busy');
		await expect(engine.live(samples())).rejects.toThrow('busy');
		engine.gate.restore('live');
		const restored = engine.live(samples());
		current().answer({ id: current().last().id, json: '{}' });
		await expect(restored).resolves.toEqual({});
	});

	it('reshapes answers of a kind while a patch is set', async () => {
		engine.gate.patch('analyze', (detail) => ({ ...detail, clipping_fraction: 0.02 }));
		const patched = engine.analyze(samples());
		current().answer({ id: current().last().id, json: '{"duration":1}' });
		await expect(patched).resolves.toEqual({ duration: 1, clipping_fraction: 0.02 });
		engine.gate.patch('analyze', null);
		const plain = engine.analyze(samples());
		current().answer({ id: current().last().id, json: '{"duration":1}' });
		await expect(plain).resolves.toEqual({ duration: 1 });
	});
});
