/* Two complete takes are committed together, so an interrupted write keeps the old pair. */
export type TakeMetadata = { id: string; features?: unknown; duration?: number; quality?: Record<string, number>; [key: string]: unknown };
export type TakeSnapshot = { range?: unknown; measurement?: unknown; detail?: unknown; [key: string]: unknown };
export type TakePair = { current?: { takeId?: string } | null; previous?: { takeId?: string } | null };
export type AnalysisDetail = { features: unknown; duration: number; voiced_seconds?: number; formant_seconds?: number; clipping_fraction?: number; resonance_sensitivity_pct?: number; [key: string]: unknown };
type Change = (snapshot: TakeSnapshot | undefined, metadata: TakeMetadata | undefined) => { snapshot: TakeSnapshot; metadata: TakeMetadata } | null;

export const TakeStore = {
	db: null as IDBDatabase | null,
	queue: Promise.resolve() as Promise<unknown>,
	async open(): Promise<IDBDatabase> {
		if (this.db) return this.db;
		this.db = await new Promise<IDBDatabase>((resolve, reject) => {
			const r = indexedDB.open('koe-takes', 1);
			r.onupgradeneeded = () => r.result.createObjectStore('session');
			r.onsuccess = () => resolve(r.result);
			r.onerror = () => reject(r.error);
		});
		return this.db;
	},
	async read<T = unknown>(key = 'takes'): Promise<T> {
		const db = await this.open();
		return new Promise<T>((resolve, reject) => {
			const r = db.transaction('session').objectStore('session').get(key);
			r.onsuccess = () => resolve(r.result as T);
			r.onerror = () => reject(r.error);
		});
	},
	write(pair: unknown, key = 'takes'): Promise<unknown> {
		return this.writeEntries([[pair, key]]);
	},
	writeEntries(entries: [unknown, string][]): Promise<unknown> {
		this.queue = this.queue
			.catch(() => {})
			.then(async () => {
				const db = await this.open();
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction('session', 'readwrite');
					for (const [value, key] of entries) tx.objectStore('session').put(value, key);
					tx.oncomplete = () => resolve();
					tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage failed'));
				});
			});
		return this.queue;
	},
	saveRecording(snapshot: TakeSnapshot, metadata: TakeMetadata) {
		return this.recordingTransaction(metadata.id, () => ({ snapshot, metadata }));
	},
	deleteRecording(id: string): Promise<TakeMetadata[]> {
		const operation = this.queue
			.catch(() => {})
			.then(async () => {
				const db = await this.open();
				return new Promise<TakeMetadata[]>((resolve, reject) => {
					const tx = db.transaction('session', 'readwrite'),
						store = tx.objectStore('session');
					let index: TakeMetadata[] = [],
						pair: TakePair | undefined,
						remaining = 2;
					const remove = () => {
						if (--remaining) return;
						index = index.filter((t) => t.id !== id);
						store.delete('recording:' + id);
						store.put(index, 'recording-index');
						if (pair)
							store.put(
								{ current: pair.current?.takeId === id ? null : pair.current, previous: pair.previous?.takeId === id ? null : pair.previous },
								'takes'
							);
					};
					const list = store.get('recording-index');
					list.onsuccess = () => {
						index = list.result || [];
						remove();
					};
					const saved = store.get('takes');
					saved.onsuccess = () => {
						pair = saved.result;
						remove();
					};
					tx.oncomplete = () => resolve(index);
					tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage failed'));
				});
			});
		this.queue = operation;
		return operation;
	},
	finishRecording(id: string, detail: AnalysisDetail) {
		return this.recordingTransaction(id, (snapshot, metadata) => {
			if (!snapshot || !metadata) return null;
			const quality = Object.fromEntries(
				['voiced_seconds', 'formant_seconds', 'clipping_fraction', 'resonance_sensitivity_pct'].map((k) => [k, detail[k] as number])
			);
			return {
				snapshot: { ...snapshot, detail, measurement: snapshot.range ? snapshot.measurement : detail },
				metadata: { ...metadata, features: detail.features, duration: detail.duration, quality }
			};
		});
	},
	recordingTransaction(id: string, change: Change): Promise<{ snapshot: TakeSnapshot; index: TakeMetadata[] } | null> {
		const operation = this.queue
			.catch(() => {})
			.then(async () => {
				const db = await this.open();
				return new Promise<{ snapshot: TakeSnapshot; index: TakeMetadata[] } | null>((resolve, reject) => {
					const tx = db.transaction('session', 'readwrite'),
						store = tx.objectStore('session');
					let index: TakeMetadata[] = [],
						snapshot: TakeSnapshot | undefined,
						result: { snapshot: TakeSnapshot; index: TakeMetadata[] } | null | undefined,
						remaining = 2;
					const update = () => {
						if (--remaining) return;
						const changed = change(
							snapshot,
							index.find((t) => t.id === id)
						);
						if (!changed) {
							result = null;
							return;
						}
						const next = index.some((t) => t.id === id) ? index.map((t) => (t.id === id ? changed.metadata : t)) : [changed.metadata, ...index];
						store.put(changed.snapshot, 'recording:' + id);
						store.put(next, 'recording-index');
						result = { snapshot: changed.snapshot, index: next };
					};
					const saved = store.get('recording:' + id);
					saved.onsuccess = () => {
						snapshot = saved.result;
						update();
					};
					const list = store.get('recording-index');
					list.onsuccess = () => {
						index = list.result || [];
						update();
					};
					tx.oncomplete = () => resolve(result as { snapshot: TakeSnapshot; index: TakeMetadata[] } | null);
					tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage failed'));
				});
			});
		this.queue = operation;
		return operation;
	}
};
