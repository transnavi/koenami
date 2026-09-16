"""Find Common Voice clips that do not sound like the rest of their speaker's clips.

A speaker-verification embedding is the right tool for exactly this question. Every Japanese Common Voice clip
that the selection rules admit is embedded with WavLM-base-plus-sv (cached in research/sv-embeddings.json);
for speakers with at least three clips, each clip's cosine distance to the centroid of the speaker's *other*
clips is compared with the distance distribution across all speakers. Clips beyond the threshold are listed
in research/speaker-consistency.json for a listening check; nothing is excluded automatically.

Runs in the embedding environment (.venv-embedding) with KOENAMI_CUDA=1.
"""
import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

if os.environ.get('KOENAMI_CUDA') == '1':
    import torch  # noqa: F401  (loads the CUDA runtime the ONNX provider needs)
    import onnxruntime as ort
    ort.preload_dlls()
import perception
from build_common_voice_ja import metadata, selection, speaker_id

ROOT = Path(__file__).parent
CACHE = ROOT / 'research/sv-embeddings.json'


def embed(path):
    x, sr = sf.read(path, dtype='float32')
    if x.ndim > 1: x = x.mean(1)
    if sr != 16000: x = resample_poly(x, 16000, sr).astype(np.float32)
    parts = perception.windows(x)
    v = np.mean([perception.session('wavlm').run(None, {'values': p})[0][0] for p in parts], axis=0)
    return (v / (np.linalg.norm(v) + 1e-8)).tolist()


def main():
    # Clips the speech screen or a listener already removed cannot be "another speaker"; keep them out.
    quality = json.loads((ROOT / 'data/speech-quality.json').read_text()) if (ROOT / 'data/speech-quality.json').exists() else {}
    import curation
    dropped = curation.Verdicts().excluded_clips | {c for c, q in quality.items() if q.get('empty')}
    rows = [r for r in metadata() if selection(r) and Path(r['file_name']).stem not in dropped]
    labels = json.loads((ROOT / 'curation/reference-labels.json').read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    pending = [r for r in rows if Path(r['file_name']).stem not in cache and (ROOT / 'data/samples' / r['file_name']).exists()]
    for i, r in enumerate(pending):
        stem = Path(r['file_name']).stem
        try: cache[stem] = {'speaker': speaker_id(r), 'embedding': embed(ROOT / 'data/samples' / r['file_name'])}
        except ValueError: cache[stem] = {'speaker': speaker_id(r), 'embedding': None}
        if i % 100 == 99:
            CACHE.write_text(json.dumps(cache)); print('embedded', i + 1, '/', len(pending), flush=True)
    CACHE.parent.mkdir(exist_ok=True); CACHE.write_text(json.dumps(cache))
    keep = {Path(r['file_name']).stem for r in rows}
    by_speaker = {}
    for stem, item in cache.items():
        if item['embedding'] and stem in keep: by_speaker.setdefault(item['speaker'], []).append((stem, np.array(item['embedding'])))
    distances = []
    for sid, items in by_speaker.items():
        if len(items) < 3: continue
        for stem, v in items:
            others = np.mean([u for s, u in items if s != stem], axis=0); others /= np.linalg.norm(others) + 1e-8
            distances.append((sid, stem, float(1 - v @ others), len(items)))
    d = np.array([x[2] for x in distances])
    threshold = float(np.percentile(d, 97.5)) if len(d) else 1.0
    suspects = sorted([{'speaker': sid, 'clip': stem, 'display': labels.get(stem), 'distance': round(dist, 4), 'clips': n}
                       for sid, stem, dist, n in distances if dist > threshold], key=lambda s: -s['distance'])
    result = {'clips_scored': len(d), 'speakers_scored': len({x[0] for x in distances}), 'distance_median': float(np.median(d)) if len(d) else None,
              'threshold_p97_5': threshold, 'suspects': suspects}
    (ROOT / 'research/speaker-consistency.json').write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in result.items() if k != 'suspects'}), flush=True)
    for s in suspects[:30]: print(s['display'], s['clip'], s['distance'], f"{s['clips']} clips")


if __name__ == '__main__':
    main()
