"""The listener's own recordings as a private pool for the local review pages.

WAV files dropped into `data/own/` (never committed, never published) become clips with an opaque id
derived from the file contents, no name and no text, measured with the same acoustic pipeline as the
references. Judgements that mention an own clip are written to `data/own/*.jsonl` by `curation`, so the
public logs never carry them.
"""
import hashlib
import json
from pathlib import Path

import soundfile as sf

from acoustics import VERSION, measure


def clip_id(path):
    return 'own-' + hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def load(data):
    """Return (clips, audio_paths) for every WAV under data/own, measuring new files and caching the result."""
    folder = Path(data) / 'own'
    if not folder.is_dir(): return [], {}
    cache_path = folder / 'measurements.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    clips, paths, changed = [], {}, False
    for path in sorted(folder.glob('*.wav')):
        cid = clip_id(path)
        if cache.get(cid, {}).get('version') != VERSION:
            audio, rate = sf.read(path, dtype='float32')
            if audio.ndim > 1: audio = audio.mean(axis=1)
            measured = measure(audio, rate)
            cache[cid] = {'version': VERSION, 'duration': measured['duration'], 'features': measured['features'],
                          'voiced_seconds': measured.get('voiced_seconds'), 'reason': measured.get('reason')}
            changed = True
        m = cache[cid]
        keys = ('f0', 'delta_f', 'hnr', 'balance', 'pitch_span')
        plotted = m.get('reason') is None and all(isinstance(m['features'].get(k), (int, float)) for k in keys)
        clips.append({'id': cid, 'speaker': cid, 'name': '自分', 'group': 'own', 'language': 'ja', 'dataset': 'Own', 'text': '',
                      'audio': f'/samples/{cid}.wav', 'duration': m['duration'], 'features': m['features'], 'plotted': plotted, 'private': True})
        paths[f'{cid}.wav'] = path
    if changed: cache_path.write_text(json.dumps(cache))
    return clips, paths
