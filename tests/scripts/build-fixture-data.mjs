// Builds tests/fixtures/data from a prepared public data set (`.deploy/data` of a
// prepare_public.py run). Only CC0 Common Voice clips carry audio; VOICEVOX and JVS
// entries keep metadata alone. The result has the KOENAMI_DATA layout, so server.py
// can serve it while API fixtures are recorded.
//   node tests/scripts/build-fixture-data.mjs /path/to/.deploy/data
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('usage: build-fixture-data.mjs <deploy-data-dir>');
const out = fileURLToPath(new URL('../fixtures/data/', import.meta.url));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'libraries'), { recursive: true });
mkdirSync(join(out, 'samples'));

const read = (name) => JSON.parse(readFileSync(join(source, name), 'utf8'));
const cc0 = (c) => c.dataset === 'Common Voice' || /common_voice/.test(c.source || '');

// Deterministic subset: the first N speakers per group in id order, up to K clips each.
function subset(clips, speakersPerGroup, clipsPerSpeaker) {
	const chosen = [];
	for (const group of ['female', 'male']) {
		const bySpeaker = new Map();
		for (const c of clips.filter((c) => c.group === group && cc0(c) && c.plotted).sort((a, b) => a.id.localeCompare(b.id))) {
			if (!bySpeaker.has(c.speaker) && bySpeaker.size >= speakersPerGroup) continue;
			const list = bySpeaker.get(c.speaker) || bySpeaker.set(c.speaker, []).get(c.speaker);
			if (list.length < clipsPerSpeaker) list.push(c);
		}
		for (const list of bySpeaker.values()) chosen.push(...list);
	}
	return chosen;
}
const audio = new Set();
const ja = read('native-ja.json');
const jaClips = subset(ja.clips, 10, 4);
jaClips.forEach((c) => audio.add(basename(c.audio)));
writeFileSync(join(out, 'native-ja.json'), JSON.stringify({ ...ja, clips: jaClips }));

for (const lang of ['zh-CN', 'en', 'ko']) {
	const lib = read(`libraries/${lang}.json`);
	const clips = subset(lib.clips, 10, 1);
	clips.forEach((c) => audio.add(basename(c.audio)));
	writeFileSync(join(out, `libraries/${lang}.json`), JSON.stringify({ ...lib, clips }));
}

const voicevox = read('voicevox.json');
writeFileSync(join(out, 'voicevox.json'), JSON.stringify({ ...voicevox, clips: voicevox.clips.filter((c) => c.language === 'ja').slice(0, 4) }));

// Three JVS index entries keep their metadata but point at generated tones under
// tests/fixtures/audio/jvs (the archive itself cannot be redistributed).
const jvs = read('jvs-import-index.json');
const plotted = jvs.clips.filter((c) => c.plotted);
const stand = [plotted.find((c) => c.speaker === 'jvs001'), plotted.filter((c) => c.speaker === 'jvs001')[1], plotted.find((c) => c.speaker === 'jvs002')];
const tones = stand.map((c, i) => {
	const bytes = readFileSync(fileURLToPath(new URL(`../fixtures/audio/jvs/clip${i + 1}.wav`, import.meta.url)));
	return { ...c, bytes: bytes.length, original_sha256: createHash('sha256').update(bytes).digest('hex'), fixture: `clip${i + 1}.wav` };
});
writeFileSync(join(out, 'jvs-import-index.json'), JSON.stringify({ ...jvs, $comment: 'Three index entries whose bytes and SHA-256 point at the generated tones in tests/fixtures/audio/jvs, so the JVS import can be exercised without the licensed archive.', clips: tones }));

for (const file of audio) copyFileSync(join(source, 'samples', file), join(out, 'samples', file));
console.log(`ja ${jaClips.length} clips, ${audio.size} audio files → tests/fixtures/data`);
