/* The studio's side of the measurement worker, against a stand-in worker.
 *
 * What is pinned here is what the studio depends on when a listener moves
 * on mid-measurement or the engine fails to start: every call settles, and
 * a call nobody is waiting for is cancelled rather than measured. The module
 * belongs to the SvelteKit tree, so the run against the pinned vanilla tree
 * (KOENAMI_TREE=old) skips it. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Posted = { id: number; kind: string; cancel?: number };

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
}

vi.mock('@app/measure/worker?worker', () => ({ default: FakeWorker }));

let engine: typeof import('@app/measure/engine');
const samples = () => new Float32Array([0, 0.5, -0.5, 0]);
const current = () => FakeWorker.live.at(-1)!;

beforeEach(async () => {
	if (process.env.KOENAMI_TREE !== 'new') return;
	FakeWorker.live = [];
	vi.resetModules();
	engine = await import('@app/measure/engine');
});
afterEach(() => engine?.stop());

describe.skipIf(process.env.KOENAMI_TREE !== 'new')('the measurement engine', () => {
	it('answers each call with its own result', async () => {
		const first = engine.analyze(samples() as never);
		const second = engine.analyze(samples() as never);
		const [a, b] = current().posted;
		current().answer({ id: b.id, json: '{"duration":2}' });
		current().answer({ id: a.id, json: '{"duration":1}' });
		expect(await first).toEqual({ duration: 1 });
		expect(await second).toEqual({ duration: 2 });
	});

	it('starts one worker and keeps it', async () => {
		const call = engine.version();
		engine.analyze(samples() as never);
		expect(FakeWorker.live).toHaveLength(1);
		current().answer({ id: current().posted[0].id, json: '4.0.1' });
		expect(await call).toBe('4.0.1');
	});

	it('cancels a call the caller has abandoned', async () => {
		const controller = new AbortController();
		const call = engine.live(samples() as never, controller.signal);
		const { id } = current().posted[0];
		controller.abort();
		await expect(call).rejects.toMatchObject({ name: 'AbortError' });
		expect(current().posted.some((message) => message.kind === 'cancel' && message.cancel === id)).toBe(true);
		// The answer to a cancelled call is dropped rather than resolving it.
		expect(() => current().answer({ id, json: '{}' })).not.toThrow();
	});

	it('refuses a call whose signal has already been aborted', async () => {
		await expect(engine.analyze(samples() as never, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('rejects a call the worker reports as cancelled', async () => {
		const call = engine.live(samples() as never);
		current().answer({ id: current().posted[0].id, cancelled: true });
		await expect(call).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('fails every call in flight when the worker does, and starts a new one after', async () => {
		const first = engine.analyze(samples() as never);
		const second = engine.live(samples() as never);
		const failed = current();
		failed.onerror?.({ message: 'wasm failed to start' });
		await expect(first).rejects.toThrow('wasm failed to start');
		await expect(second).rejects.toThrow('wasm failed to start');
		expect(failed.terminated).toBe(true);
		const next = engine.version();
		expect(FakeWorker.live).toHaveLength(2);
		current().answer({ id: current().posted[0].id, json: '4.0.1' });
		await expect(next).resolves.toBe('4.0.1');
	});

	it('reports what the worker could not measure', async () => {
		const call = engine.analyze(samples() as never);
		current().answer({ id: current().posted[0].id, error: 'Audio must contain finite samples.' });
		await expect(call).rejects.toThrow('Audio must contain finite samples.');
	});

	it('fails calls in flight when it is stopped', async () => {
		const call = engine.analyze(samples() as never);
		engine.stop();
		await expect(call).rejects.toMatchObject({ name: 'AbortError' });
	});

	it('keeps the caller’s samples', async () => {
		const pcm = samples();
		const call = engine.analyze(pcm as never);
		current().answer({ id: current().posted[0].id, json: '{}' });
		await call;
		expect(Array.from(pcm)).toEqual([0, 0.5, -0.5, 0]);
	});

	it('refuses a channel count or rate the engine cannot use', async () => {
		await expect(engine.mono16(samples(), 0, 48000)).rejects.toThrow('whole number of channels');
		await expect(engine.mono16(samples(), 1.5, 48000)).rejects.toThrow('whole number of channels');
		await expect(engine.mono16(samples(), 2, 0)).rejects.toThrow('sample rate');
	});
});
