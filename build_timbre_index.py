"""Timbre vectors for every plotted reference clip, for ranking references by similarity to a recording.

Runs `perception.timbre` (the prepared WavLM graph's layer-3 frames, pooled over
speech) on each plotted clip of the served libraries — JVS, the Common Voice
collections, VOICEVOX and the synthetic set — and writes
`data/timbre-index-<TIMBRE_VERSION>.npz` with the clip ids, their language,
speaker, group and synthetic flag, and one float16 vector per clip. The file is
keyed by the descriptor version: a different crop, layer or pooling rule gets a
new file, never a mixed one. Existing vectors for the same version are kept, so
a rerun only encodes clips added since. Own recordings are never indexed.

    .venv/bin/python build_timbre_index.py            CPU, about an hour
    KOENAMI_CUDA=1 .venv-embedding/bin/python build_timbre_index.py

The server loads the file that matches its `perception.TIMBRE_VERSION` and serves
`/api/similar` when the prepared model is also present.
"""
from pathlib import Path
import json, os, time
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
if os.environ.get('KOENAMI_CUDA') == '1':
    import onnxruntime as ort; ort.preload_dlls(directory='')
import perception
from acoustics import RATE
from server import DATA, LANGUAGES

OUT = DATA / f'timbre-index-{perception.TIMBRE_VERSION}.npz'


def reference_clips():
    """The plotted clips of every served library, in the server's own reading of them."""
    clips = []
    for lang in LANGUAGES:
        path = DATA / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json')
        if path.exists(): clips += [dict(c, language=lang) for c in json.loads(path.read_text())['clips']]
    for filename in ['synthetic.json', 'voicevox.json']:
        if (DATA / filename).exists(): clips += json.loads((DATA / filename).read_text())['clips']
    return [c for c in clips if c.get('plotted') and c['language'] in LANGUAGES and c['audio'].startswith('/samples/')]


def pcm(clip):
    x, rate = sf.read(DATA / 'samples' / Path(clip['audio']).name, dtype='float32')
    if x.ndim > 1: x = x.mean(axis=1)
    if rate != RATE: x = resample_poly(x, RATE, rate).astype('float32')
    return x


def main():
    clips = reference_clips(); done = {}
    if OUT.is_file():
        old = np.load(OUT, allow_pickle=False); done = dict(zip(old['ids'].tolist(), old['vectors']))
    rows, vectors, skipped, start = [], [], [], time.monotonic()
    for i, c in enumerate(clips):
        if c['id'] in done: v = done[c['id']]
        else:
            try: v = perception.timbre(pcm(c)).astype('float16')
            except ValueError as e: skipped.append((c['id'], str(e))); continue
        rows.append(c); vectors.append(v)
        if i % 500 == 0: print(f'{i} / {len(clips)}  {round(time.monotonic() - start)} s', flush=True)
    np.savez(OUT, version=perception.TIMBRE_VERSION, ids=np.array([c['id'] for c in rows]), language=np.array([c['language'] for c in rows]),
             speaker=np.array([c['speaker'] for c in rows]), group=np.array([c.get('group', '') for c in rows]),
             synthetic=np.array([bool(c.get('synthetic')) for c in rows]), vectors=np.array(vectors, 'float16'))
    print(f'{OUT.name}: {len(rows)} clips, {len(skipped)} skipped, {round(time.monotonic() - start)} s', flush=True)
    for cid, why in skipped[:10]: print('  skipped', cid, why)


if __name__ == '__main__': main()
