import { IDBFactory } from 'fake-indexeddb';
import { describe, it, beforeEach, expect } from 'vitest';

import { golden } from './golden';

const { TakeStore } = await import('@app/storage');

async function dump() {
	const db = (await TakeStore.open()) as unknown as IDBDatabase;
	return new Promise<Record<string, unknown>>((resolve, reject) => {
		const store = db.transaction('session').objectStore('session');
		const keys = store.getAllKeys(),
			values = store.getAll();
		values.onsuccess = () =>
			resolve(Object.fromEntries((keys.result as string[]).map((k, i) => [k, values.result[i]])));
		values.onerror = () => reject(values.error);
	});
}
const snap = (n: number) => ({
	pcm: { $typed: 'Float32Array', values: [n, n + 1] },
	measurement: { f0: 100 + n },
	range: null
});
const meta = (id: string, n: number) => ({
	id,
	name: `take ${n}`,
	at: 1700000000000 + n,
	takeId: id
});

describe('TakeStore', () => {
	beforeEach(() => {
		globalThis.indexedDB = new IDBFactory();
		TakeStore.db = null;
		TakeStore.queue = Promise.resolve();
	});

	it('opens once, reads missing keys as undefined, writes pairs', async () => {
		const db1 = await TakeStore.open(),
			db2 = await TakeStore.open();
		expect(db1).toBe(db2);
		const before = await TakeStore.read();
		await TakeStore.write({ current: { takeId: 'a' }, previous: null });
		await TakeStore.writeEntries([
			[['x'], 'jvs-index'],
			[{ k: 1 }, 'custom']
		]);
		golden('storage.basic', {
			before,
			takes: await TakeStore.read(),
			jvs: await TakeStore.read('jvs-index'),
			all: await dump()
		});
	});

	it('saveRecording / finishRecording / deleteRecording keep index and pair consistent', async () => {
		const s1 = await TakeStore.saveRecording(snap(1), meta('r1', 1));
		const s2 = await TakeStore.saveRecording(snap(2), meta('r2', 2));
		const s1again = await TakeStore.saveRecording(snap(3), meta('r1', 3));
		await TakeStore.write({ current: { takeId: 'r2' }, previous: { takeId: 'r1' } });
		const f1 = await TakeStore.finishRecording('r1', { features: { f0: 1 }, duration: 2.5 });
		const fMissing = await TakeStore.finishRecording('nope', { features: {}, duration: 0 });
		const ranged = await TakeStore.saveRecording(
			{ ...snap(4), range: [0, 1], measurement: { f0: 4 } },
			meta('r3', 4)
		);
		const f3 = await TakeStore.finishRecording('r3', { features: { f0: 3 }, duration: 1 });
		const afterFinish = await dump();
		// updateRecording reshapes a stored take's entry and snapshot together (renaming, the
		// waveform peaks); a take that has no snapshot is left alone.
		const renamed = await TakeStore.updateRecording(
			'r3',
			(snapshot: unknown, metadata: Record<string, unknown>) => ({
				snapshot,
				metadata: { ...metadata, name: 'renamed', peaks: [0, 0.5, 1] }
			})
		);
		const updateMissing = await TakeStore.updateRecording(
			'ghost',
			(snapshot: unknown, metadata: Record<string, unknown>) => ({
				snapshot,
				metadata: { ...metadata, name: 'never' }
			})
		);
		const afterUpdate = await dump();
		const d2 = await TakeStore.deleteRecording('r2');
		const dMissing = await TakeStore.deleteRecording('ghost');
		const d1 = await TakeStore.deleteRecording('r1');
		golden('storage.recordings', {
			s1,
			s2,
			s1again,
			f1,
			fMissing,
			ranged,
			f3,
			afterFinish,
			renamed,
			updateMissing,
			afterUpdate,
			d2,
			dMissing,
			d1,
			final: await dump()
		});
	});

	it('deleteRecording without a saved pair or index', async () => {
		const unindexed = await TakeStore.deleteRecording('nothing');
		await TakeStore.saveRecording(snap(1), meta('solo', 1));
		golden('storage.delete-no-pair', {
			unindexed,
			result: await TakeStore.deleteRecording('solo'),
			final: await dump()
		});
	});

	it('serializes writes and recovers after a failed operation', async () => {
		const failing = TakeStore.writeEntries([[{ fn: () => 1 }, 'bad']]);
		await expect(failing).rejects.toBeTruthy();
		await TakeStore.write({ current: null, previous: null });
		const custom = TakeStore.recordingTransaction('q', () => ({
			snapshot: snap(9),
			metadata: meta('q', 9)
		}));
		const nothing = TakeStore.recordingTransaction('q', () => null);
		golden('storage.queue', { custom: await custom, nothing: await nothing, final: await dump() });
	});

	it('surfaces transaction failures with and without an error object', async () => {
		await TakeStore.saveRecording(snap(1), meta('r1', 1));
		// A transaction that reports failure through onerror/onabort, as a quota error would.
		const original = IDBDatabase.prototype.transaction;
		let error: Error | null = new Error('quota');
		const results: string[] = [];
		try {
			IDBDatabase.prototype.transaction = function () {
				const tx = {
					error,
					objectStore: () => ({ put: () => {}, delete: () => {}, get: () => ({}) }),
					oncomplete: null as unknown,
					onabort: null as unknown,
					onerror: null as unknown
				};
				setTimeout(() => (tx.onerror as () => void)());
				return tx as never;
			};
			results.push(
				await TakeStore.write({ current: null, previous: null }).catch((e) => e.message)
			);
			results.push(await TakeStore.deleteRecording('r1').catch((e) => e.message));
			results.push(await TakeStore.recordingTransaction('r1', () => null).catch((e) => e.message));
			error = null;
			results.push(
				await TakeStore.write({ current: null, previous: null }).catch((e) => e.message)
			);
			results.push(await TakeStore.deleteRecording('r1').catch((e) => e.message));
			results.push(await TakeStore.recordingTransaction('r1', () => null).catch((e) => e.message));
			IDBDatabase.prototype.transaction = function () {
				const tx = {
					objectStore: () => ({
						get: () => {
							const r = { error: new Error('read failed'), onerror: null as unknown };
							setTimeout(() => (r.onerror as () => void)());
							return r;
						}
					})
				};
				return tx as never;
			};
			results.push(await TakeStore.read().catch((e) => e.message));
		} finally {
			IDBDatabase.prototype.transaction = original;
		}
		results.push(String((await TakeStore.read('recording-index'))?.length));
		golden('storage.failures', results);
	});

	it('rejects when the database cannot open', async () => {
		globalThis.indexedDB = {
			open: () => {
				const r: Record<string, unknown> = {};
				setTimeout(() => {
					r.error = new Error('blocked');
					(r.onerror as () => void)();
				});
				return r;
			}
		} as never;
		await expect(TakeStore.read()).rejects.toThrow('blocked');
	});
});
