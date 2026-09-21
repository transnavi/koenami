import { ZipWriter, BlobWriter, BlobReader } from '@zip.js/zip.js/index-native.js';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, beforeEach, expect, vi } from 'vitest';

import { golden, sha256 } from './golden';

const { TakeStore } = await import('@app/storage');
const { loadImported, importedAudio, importJVS } = await import('@app/corpus-import');

// Synthetic corpus: the module only checks member paths, byte sizes and SHA-256.
function wav(seed: number, size: number) {
	const bytes = new Uint8Array(new ArrayBuffer(size));
	for (let i = 0; i < size; i++) bytes[i] = (seed * 31 + i * 7) & 255;
	return bytes;
}
const members: [string, string, string, number][] = [
	['jvs001', 'parallel100', 'VOICEACTRESS100_001', 1200],
	['jvs001', 'parallel100', 'VOICEACTRESS100_002', 800],
	['jvs002', 'nonpara30', 'BASIC5000_0001', 640],
	['jvs003', 'parallel100', 'VOICEACTRESS100_003', 300]
];
const files = new Map<string, Uint8Array<ArrayBuffer>>();
const clips = await Promise.all(
	members.map(async ([spk, set, name, size], i) => {
		const member = `jvs_ver1/${spk}/${set}/wav24kHz16bit/${name}.wav`;
		const bytes = wav(i + 1, size);
		files.set(member, bytes);
		return {
			id: `${spk}-${set}-${name}`,
			speaker: spk,
			name: spk.toUpperCase(),
			group: i % 2 ? 'female' : 'male',
			member,
			bytes: size,
			original_sha256: await sha256(bytes)
		};
	})
);
// Extra entries: 11+ candidates exercise the periodic yield.
for (let i = 0; i < 12; i++) {
	const member = `jvs_ver1/jvs009/parallel100/wav24kHz16bit/EXTRA_${String(i).padStart(3, '0')}.wav`;
	const bytes = wav(100 + i, 64 + i);
	files.set(member, bytes);
	clips.push({
		id: `jvs009-parallel100-EXTRA_${String(i).padStart(3, '0')}`,
		speaker: 'jvs009',
		name: 'JVS009',
		group: 'female',
		member,
		bytes: bytes.length,
		original_sha256: await sha256(bytes)
	});
}

async function zip(entries: Iterable<[string, Uint8Array<ArrayBuffer>]>, name = 'jvs_ver1.zip') {
	const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
	for (const [path, bytes] of entries) await writer.add(path, new BlobReader(new Blob([bytes])));
	return new File([await writer.close()], name);
}
function folder(entries: Iterable<[string, Uint8Array<ArrayBuffer>]>) {
	return [...entries].map(([path, bytes]) =>
		Object.assign(new File([bytes], path.split('/').pop()!), { webkitRelativePath: path })
	);
}

let fetchImpl: () => Promise<Response>;
async function run(input: File[], signal = new AbortController().signal) {
	const progress: [number, number][] = [];
	try {
		const result = await importJVS(input, (a: number, b: number) => progress.push([a, b]), signal);
		return { result, progress };
	} catch (error) {
		return { error: (error as Error).message, progress };
	}
}
async function stored() {
	const ids = (await TakeStore.read<string[]>('jvs-index')) || [];
	return {
		ids,
		audio: await Promise.all(
			ids.map(async (id: string) => [
				id,
				await sha256(await (await TakeStore.read<Blob>('jvs-audio:' + id)).arrayBuffer())
			])
		)
	};
}

describe('JVS import', () => {
	beforeEach(() => {
		globalThis.indexedDB = new IDBFactory();
		TakeStore.db = null;
		TakeStore.queue = Promise.resolve();
		fetchImpl = async () => new Response(JSON.stringify({ clips }), { status: 200 });
		vi.stubGlobal('fetch', (...args: unknown[]) => fetchImpl(...(args as [])));
		vi.stubGlobal('navigator', { storage: { estimate: async () => ({ quota: 1e9, usage: 0 }) } });
	});

	it('nothing imported yet', async () => {
		golden('corpus.empty', {
			imported: await loadImported(),
			audio: await importedAudio('missing').catch((e) => e.message)
		});
	});

	it('imports the whole zip, then reports zero additions on a repeat', async () => {
		const archive = await zip(files);
		const first = await run([archive]);
		const again = await run([archive]);
		const loaded = await loadImported();
		golden('corpus.zip', {
			first,
			again,
			stored: await stored(),
			loaded: loaded.map((c: { id: string; localLibrary: boolean }) => [c.id, c.localLibrary]),
			audio: await sha256(await (await importedAudio(clips[0].id)).arrayBuffer())
		});
	});

	it('imports an extracted folder, with backslash paths and unknown files', async () => {
		const subset = [...files].slice(0, 3);
		const input = [
			...folder(
				subset.map(([p, b]) => [p.replaceAll('/', '\\'), b] as [string, Uint8Array<ArrayBuffer>])
			),
			new File([wav(9, 10)], 'notes.txt')
		];
		golden('corpus.folder', { ...(await run(input)), stored: await stored() });
	});

	it('rejects archives without matching members, size mismatches and digest mismatches', async () => {
		const wrongSize = await zip([[clips[0].member, wav(1, 999)]]);
		const wrongDigest = await zip([[clips[1].member, wav(77, clips[1].bytes)]]);
		const unrelated = await zip([['jvs_ver1/README.txt', wav(2, 20)]]);
		// A file whose size changes between selection and reading (rewritten on disk). The
		// implementation reads `size` once while selecting candidates and once after reading;
		// the getter lies from the second read on.
		class Rewritten extends File {
			reads = 0;
			get size() {
				return super.size + (this.reads++ ? 1 : 0);
			}
		}
		const rewritten = Object.assign(
			new Rewritten([files.get(clips[2].member)!], 'BASIC5000_0001.wav'),
			{ webkitRelativePath: clips[2].member }
		);
		golden('corpus.mismatch', {
			size: await run([wrongSize]),
			digest: await run([wrongDigest]),
			unrelated: await run([unrelated]),
			rewritten: await run([rewritten]),
			stored: await stored()
		});
	});

	it('stops at the abort signal and keeps completed files', async () => {
		const controller = new AbortController();
		let calls = 0;
		const original = crypto.subtle.digest.bind(crypto.subtle);
		vi.spyOn(crypto.subtle, 'digest').mockImplementation((alg, data) => {
			if (++calls === 3) controller.abort();
			return original(alg, data);
		});
		let aborted, preAborted;
		try {
			aborted = await run([await zip(files)], controller.signal);
			preAborted = await run([await zip(files)], AbortSignal.abort());
		} finally {
			vi.restoreAllMocks();
		}
		golden('corpus.abort', { aborted, preAborted, stored: await stored() });
	});

	it('quota: absent estimate passes, insufficient quota refuses, index errors propagate and retry', async () => {
		vi.stubGlobal('navigator', {});
		const noEstimate = await run([await zip([...files].slice(0, 1))]);
		vi.stubGlobal('navigator', {
			storage: { estimate: async () => ({ quota: 1000, usage: 500 }) }
		});
		const tight = await run([await zip([...files].slice(1, 3))]);
		globalThis.indexedDB = new IDBFactory();
		TakeStore.db = null;
		fetchImpl = async () => new Response('down', { status: 503 });
		// The module caches its index promise; a query string yields a fresh instance that
		// still shares storage.js, so the failed fetch and the retry start from nothing.
		const { importJVS: fresh } = await import('@app/corpus-import?index-failure');
		const failed = await fresh([await zip(files)], () => {}, new AbortController().signal).catch(
			(e: Error) => e.message
		);
		fetchImpl = async () => new Response(JSON.stringify({ clips }), { status: 200 });
		const recovered = await fresh(
			[await zip([...files].slice(3, 4))],
			() => {},
			new AbortController().signal
		);
		golden('corpus.quota', { noEstimate, tight, failed, recovered, stored: await stored() });
		expect(recovered.added).toBe(1);
	});
});
