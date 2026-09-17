import type { FileEntry } from '@zip.js/zip.js';
import { TakeStore } from './storage';

export type ImportClip = { id: string; member: string; bytes: number; original_sha256: string; [key: string]: unknown };
export type ImportedClip = ImportClip & { localLibrary: true };

let indexPromise: Promise<Map<string, ImportClip>> | null = null;
async function index(): Promise<Map<string, ImportClip>> {
	if (!indexPromise)
		indexPromise = fetch('/api/import-index/jvs')
			.then(async (response) => {
				if (!response.ok) throw new Error('JVSの一覧を取得できませんでした。');
				return new Map(((await response.json()) as { clips: ImportClip[] }).clips.map((c) => [c.id, c]));
			})
			.catch((error) => {
				indexPromise = null;
				throw error;
			});
	return indexPromise;
}

/* The index records are the library's clip records with the archive fields; the caller names
   the record type it reads them as. */
export async function loadImported<C extends ImportClip = ImportClip>(): Promise<(C & { localLibrary: true })[]> {
	const ids = (await TakeStore.read<string[] | undefined>('jvs-index')) || [];
	if (!ids.length) return [];
	const entries = (await index()) as Map<string, C>;
	return ids.filter((id) => entries.has(id)).map((id) => ({ ...entries.get(id)!, localLibrary: true as const }));
}

export async function importedAudio(id: string): Promise<Blob> {
	const blob = await TakeStore.read<Blob | undefined>('jvs-audio:' + id);
	if (!blob) throw new Error('JVSの音声が見つかりません。もう一度追加してください。');
	return blob;
}

function member(name: string): string | undefined {
	return name.replaceAll('\\', '/').match(/(?:^|\/)(jvs\d{3}\/(?:parallel100|nonpara30)\/wav24kHz16bit\/[^/]+\.wav)$/)?.[1];
}

export async function importJVS(files: ArrayLike<File> & Iterable<File>, progress: (done: number, total: number) => void, signal: AbortSignal) {
	const { ZipReader, BlobReader, BlobWriter } = await import('@zip.js/zip.js/index-native.js');
	const metadata = await index();
	const byMember = new Map([...metadata.values()].map((c) => [member(c.member), c]));
	const ids = new Set((await TakeStore.read<string[] | undefined>('jvs-index')) || []);
	const candidates = new Map<string, { clip: ImportClip; read: () => Promise<Blob> }>();
	let archive: InstanceType<typeof ZipReader<Blob>> | undefined;
	try {
		if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
			archive = new ZipReader(new BlobReader(files[0]), { useWebWorkers: false });
			for await (const entry of archive.getEntriesGenerator()) {
				signal.throwIfAborted();
				const clip = byMember.get(member(entry.filename));
				if (clip && !ids.has(clip.id) && entry.uncompressedSize === clip.bytes)
					// Only file entries carry a member name the index knows.
					candidates.set(clip.id, { clip, read: () => (entry as FileEntry).getData(new BlobWriter('audio/wav'), { signal }) });
			}
		} else {
			for (const file of files) {
				const clip = byMember.get(member(file.webkitRelativePath || file.name));
				if (clip && !ids.has(clip.id) && file.size === clip.bytes) candidates.set(clip.id, { clip, read: async () => file });
			}
		}
		if (!candidates.size) {
			if (ids.size) return { added: 0, total: ids.size };
			throw new Error('対応するJVS音声が見つかりませんでした。公式のZIPか、展開したフォルダーを選んでください。');
		}
		const estimate = await navigator.storage?.estimate?.();
		const required = [...candidates.values()].reduce((n, { clip }) => n + clip.bytes, 0);
		if (estimate?.quota && required > estimate.quota - (estimate.usage || 0))
			throw new Error('保存容量が足りません。話者ごとのフォルダーを選ぶと、一部だけ追加できます。');
		let done = 0;
		progress(0, candidates.size);
		for (const { clip, read } of candidates.values()) {
			signal.throwIfAborted();
			const blob = await read();
			if (blob.size !== clip.bytes) throw new Error('音声ファイルのサイズが一致しません。');
			const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map((n) => n.toString(16).padStart(2, '0')).join('');
			if (digest !== clip.original_sha256) throw new Error('公式音声と一致しないファイルがあります。公式のZIPを選び直してください。');
			signal.throwIfAborted();
			ids.add(clip.id);
			// Audio and its index entry commit together; cancellation keeps completed files.
			await TakeStore.writeEntries([
				[blob, 'jvs-audio:' + clip.id],
				[[...ids], 'jvs-index']
			]);
			progress(++done, candidates.size);
			if (done % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
		}
		return { added: done, total: ids.size };
	} finally {
		await archive?.close();
	}
}
