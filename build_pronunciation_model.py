"""Evaluate a small Japanese pronunciation classifier from listening reviews.

Labels describe the reviewed pronunciation, not nationality or first language.
All clips from a speaker are held out together. Tentative reviews are excluded.
"""
import asyncio
import json
import os
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from build_common_voice_ja import metadata, speaker_id, POLICY
from build_library import collect
import perception

ROOT = Path(__file__).parent


def score(vector, examples):
    means = []
    for label in [0, 1]:
        distances = [max(0., 1 - float(np.dot(vector, e['embedding']))) for e in examples if e['label'] == label]
        if not distances: return None
        means.append(float(np.mean(np.exp(-np.array(distances) / .08))))
    return means[1] / max(sum(means), 1e-12)


def main():
    if os.environ.get('KOENAMI_CUDA') == '1':
        import torch
        import onnxruntime as ort
        ort.preload_dlls()
    labels = {s: 1 for s in POLICY['reviewed_speakers']}
    # Only firm pronunciation judgements train the negative class; speakers excluded for
    # audio problems or tentative impressions carry no pronunciation label.
    labels.update({r['speaker']: 0 for r in POLICY.get('listening_reviews', []) if r['judgement'] == 'not_native_like'})
    groups = {}
    for row in sorted(metadata(), key=lambda r: r['file_name']):
        sid = speaker_id(row)
        if sid in labels and row['up_votes'] >= 2 and row['down_votes'] == 0 and Path(row['file_name']).stem not in POLICY.get('excluded_clips', []):
            groups.setdefault(sid, []).append(row)
    rows = [r for group in groups.values() for r in group[:3]]
    failures = asyncio.run(collect(rows))
    if failures: raise RuntimeError('Some reviewed audio could not be downloaded.')
    cache_path = ROOT / ('data/pronunciation-vectors-'+perception.VERSION+'.json')
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    examples = []
    for sid, group in groups.items():
        vectors = []
        for row in group[:3]:
            key = row['file_name']
            if key not in cache:
                x, sr = sf.read(ROOT / 'data/samples' / key, dtype='float32')
                if x.ndim > 1: x = x.mean(axis=1)
                if sr != 16000: x = resample_poly(x, 16000, sr)
                try: parts = perception.windows(x)
                except ValueError: continue
                v = np.mean([perception.session('wavlm').run(None, {'values': p})[0][0] for p in parts], axis=0)
                v /= max(float(np.linalg.norm(v)), 1e-8)
                cache[key] = v.tolist()
            vectors.append(cache[key])
        if not vectors: continue
        v = np.mean(vectors, axis=0);v /= max(float(np.linalg.norm(v)), 1e-8)
        examples.append({'speaker': sid, 'label': labels[sid], 'clips': len(vectors), 'embedding': v.round(7).tolist()})
    cache_path.write_text(json.dumps(cache))
    folds = []
    for e in examples:
        result = score(e['embedding'], [r for r in examples if r['speaker'] != e['speaker']])
        folds.append({'speaker': e['speaker'], 'label': e['label'], 'score': round(result, 4), 'correct': (result >= .5) == bool(e['label'])})
    classes = [{'label': label, 'speakers': sum(e['label'] == label for e in examples),
                'correct': sum(e['label'] == label and e['correct'] for e in folds)} for label in [0, 1]]
    balanced = float(np.mean([c['correct']/c['speakers'] for c in classes]))
    validation = {'method': 'leave-one-speaker-out', 'classes': classes, 'balancedAccuracy': balanced,
                  'automaticFiltering': False, 'reason': 'Small listening-reviewed sample; no independently held-out corpus.'}
    model = {'version': perception.VERSION, 'examples': examples, 'validation': validation,
             'target': 'listener-rated-Japanese-pronunciation', 'bandwidth': .08}
    (perception.MODEL_DIR / 'pronunciation.json').write_text(json.dumps(model, separators=(',', ':')))
    (ROOT / 'research/pronunciation-validation.json').write_text(json.dumps({'validation': validation, 'folds': folds}, indent=2))
    print(json.dumps(validation), flush=True)


if __name__ == '__main__':
    main()
