"""Timbre vectors for every plotted reference clip, for ranking references by similarity to a recording.

Runs `perception.timbre` (layer-3 frames from the prepared timbre graph, pooled over
speech) on each plotted clip of the served libraries — JVS, the Common Voice
collections, VOICEVOX and the synthetic set — and writes
`data/timbre-index-<TIMBRE_VERSION>.npz` with the clip ids, their language,
speaker, group and synthetic flag, and one float16 vector per clip. The file is
keyed by the descriptor version: a different crop, layer or pooling rule gets a
new file, never a mixed one. Existing vectors for the same version are kept, so
a rerun only encodes clips added since. Own recordings are never indexed.

    .venv/bin/python build_timbre_index.py            CPU; KOENAMI_ORT_THREADS lifts the two-thread cap
    KOENAMI_CUDA=1 .venv-embedding/bin/python build_timbre_index.py

The index is saved at every progress checkpoint, so an interrupted build resumes.

The server loads the file that matches its `perception.TIMBRE_VERSION` and serves
`/api/similar` when the prepared model is also present.
"""
from pathlib import Path
import json, os, time
import numpy as np
import soundfile as sf
if os.environ.get('KOENAMI_CUDA') == '1':
    import onnxruntime as ort; ort.preload_dlls(directory='')
import perception
from acoustics import mono16, RATE
from server import DATA, LANGUAGES, indexable

OUT = DATA / f'timbre-index-{perception.TIMBRE_VERSION}.npz'


def reference_clips():
    """The plotted clips of every served library, in the server's own reading of them."""
    clips = []
    for lang in LANGUAGES:
        path = DATA / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json')
        if path.exists(): clips += [dict(c, language=lang) for c in json.loads(path.read_text())['clips']]
    for filename in ['synthetic.json', 'voicevox.json', 'gemini-tts.json']:
        if (DATA / filename).exists(): clips += json.loads((DATA / filename).read_text())['clips']
    return [c for c in clips if indexable(c) and c['language'] in LANGUAGES]


def pcm(clip):
    x, rate = sf.read(DATA / 'samples' / Path(clip['audio']).name, dtype='float32')
    return mono16(x, rate).astype('float32')


def save(rows, vectors, out=OUT):
    """Write the index atomically: the server may restart while a build is running."""
    tmp = out.with_suffix('.tmp.npz')
    np.savez(tmp, version=perception.TIMBRE_VERSION, ids=np.array([c['id'] for c in rows]), language=np.array([c['language'] for c in rows]),
             speaker=np.array([c['speaker'] for c in rows]), group=np.array([c.get('group', '') for c in rows]),
             synthetic=np.array([bool(c.get('synthetic')) for c in rows]), vectors=np.array(vectors, 'float16'))
    os.replace(tmp, out)


def main(clips=None, out=OUT, checkpoint=500):
    clips = reference_clips() if clips is None else clips; done = {}
    if not perception.timbre_ready(): raise SystemExit('the timbre graph (timbre.int8.onnx) is missing; run prepare_voice_models.py')
    if out.is_file():
        old = np.load(out, allow_pickle=False)
        if str(old['version']) == perception.TIMBRE_VERSION: done = dict(zip(old['ids'].tolist(), old['vectors']))
    rows, vectors, skipped, encoded, start = [], [], [], 0, time.monotonic()
    for i, c in enumerate(clips):
        if c['id'] in done: v = done[c['id']]
        else:
            # Unreadable or too short: skip and say so. An inference failure aborts; the checkpoints keep the work.
            try: v = perception.timbre(pcm(c)).astype('float16')
            except (ValueError, sf.LibsndfileError, FileNotFoundError) as e: skipped.append((c['id'], str(e))); continue
            encoded += 1
            if encoded % checkpoint == 0:
                print(f'{i} / {len(clips)}  {round(time.monotonic() - start)} s', flush=True); save(rows + [c], vectors + [v], out)
        rows.append(c); vectors.append(v)
    if rows: save(rows, vectors, out)
    print(f'{out.name}: {len(rows)} clips, {len(skipped)} skipped, {round(time.monotonic() - start)} s', flush=True)
    for cid, why in skipped[:10]: print('  skipped', cid, why)
    if not rows: raise SystemExit('nothing to index: every clip was skipped')
    return rows, skipped


if __name__ == '__main__': main()
