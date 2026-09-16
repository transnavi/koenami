"""Can transcript-aware ASR evidence separate the listener's 母語話者らしさ judgements?

For every Common Voice ja speaker with a pronunciation label from the review log (rating ≤ 2 = non-native,
≥ 5 = native-like), transcribe up to three local clips with faster-whisper against the known prompt and
compute, per clip: character error rate on Sudachi reading forms, mean token log-probability,
no-speech probability, compression ratio, reading morae per second of detected speech, plus level in dBFS
as a channel covariate. Speaker features are the clip means.

Evaluation: AUC of CER alone, then L2 logistic regression with leave-one-speaker-out, balanced accuracy with
a bootstrap interval. Results go to research/pronunciation-asr.json. Runs in the app environment (.venv)
with the same CUDA libraries as the server; --cpu falls back to int8 on CPU.
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

import curation
from build_common_voice_ja import metadata, speaker_id
from screen_reference_speech import reading

ROOT = Path(__file__).parent
CACHE = ROOT / 'research/pronunciation-asr-cache.json'


def cer(expected, heard):
    """Levenshtein distance over reading characters, normalised by the prompt length."""
    if not expected: return np.nan
    prev = list(range(len(heard) + 1))
    for i, e in enumerate(expected, 1):
        cur = [i]
        for j, h in enumerate(heard, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (e != h)))
        prev = cur
    return prev[-1] / len(expected)


def main(cpu=False):
    from faster_whisper import WhisperModel
    labels = curation.Verdicts().pronunciation_labels()
    rows = {}
    for row in sorted(metadata(), key=lambda r: r['file_name']):
        sid = speaker_id(row)
        if sid not in labels or row.get('up_votes', 0) < 2 or row.get('down_votes', 0): continue
        path = ROOT / 'data/samples' / row['file_name']
        if path.exists() and len(rows.setdefault(sid, [])) < 3: rows[sid].append((row, path))
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    pending = [(sid, row, path) for sid, items in rows.items() for row, path in items if path.stem not in cache]
    if pending:
        model = WhisperModel(str(ROOT / '.models/turbo'), device='cpu' if cpu else 'cuda', compute_type='int8' if cpu else 'float16', cpu_threads=4)
        for i, (sid, row, path) in enumerate(pending):
            x, sr = sf.read(path, dtype='float32')
            if x.ndim > 1: x = x.mean(1)
            if sr != 16000: x = resample_poly(x, 16000, sr).astype(np.float32)
            segments, info = model.transcribe(x, language='ja', beam_size=5, vad_filter=False, condition_on_previous_text=False, word_timestamps=False)
            segments = list(segments)
            text = ''.join(s.text for s in segments).strip()
            expected, heard = reading(row['text']), reading(text)
            speech = sum(s.end - s.start for s in segments) or len(x) / 16000
            level = 20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-8))
            cache[path.stem] = {'speaker': sid, 'cer': cer(expected, heard), 'logprob': float(np.mean([s.avg_logprob for s in segments])) if segments else -3.0,
                                'no_speech': float(np.mean([s.no_speech_prob for s in segments])) if segments else 1.0,
                                'compression': float(np.mean([s.compression_ratio for s in segments])) if segments else 0.0,
                                'morae_per_s': len(expected) / max(speech, .2), 'level_dbfs': level, 'transcript': text}
            if i % 10 == 9: print('transcribed', i + 1, '/', len(pending), flush=True)
        CACHE.parent.mkdir(exist_ok=True); CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    names = ['cer', 'logprob', 'no_speech', 'compression', 'morae_per_s', 'level_dbfs']
    speakers, X, y = [], [], []
    for sid, items in rows.items():
        feats = [cache[path.stem] for _, path in items if path.stem in cache]
        if not feats: continue
        speakers.append(sid); X.append([np.mean([f[n] for f in feats]) for n in names]); y.append(labels[sid])
    X, y = np.array(X, float), np.array(y, int)
    result = {'speakers': len(y), 'native': int(y.sum()), 'non_native': int((1 - y).sum()), 'features': names}
    if len(y) < 10 or y.sum() < 3 or (1 - y).sum() < 3:
        result['reason'] = 'too few labelled speakers'; print(json.dumps(result)); return
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    result['auc_single'] = {n: float(roc_auc_score(y, -X[:, i] if n in ('cer', 'no_speech') else X[:, i])) for i, n in enumerate(names)}
    pred = np.zeros(len(y)); prob = np.zeros(len(y))
    for i in range(len(y)):
        tr = np.arange(len(y)) != i
        m = make_pipeline(StandardScaler(), LogisticRegression(C=.5, class_weight='balanced', max_iter=1000)); m.fit(X[tr], y[tr])
        prob[i] = m.predict_proba(X[i:i + 1])[0, 1]; pred[i] = prob[i] >= .5
    def balanced(idx):
        p, t = pred[idx], y[idx]
        return float(np.mean([np.mean(p[t == c] == c) for c in (0, 1) if (t == c).any()]))
    rng = np.random.RandomState(0); boots = [balanced(rng.choice(len(y), len(y))) for _ in range(500)]
    result['loso'] = {'balanced_accuracy': balanced(np.arange(len(y))), 'ci95': [float(np.percentile(boots, 2.5)), float(np.percentile(boots, 97.5))],
                      'auc': float(roc_auc_score(y, prob))}
    result['per_speaker'] = [{'speaker': s, 'label': int(l), 'p_native': round(float(p), 3), 'cer': round(float(x[0]), 3)} for s, l, p, x in zip(speakers, y, prob, X)]
    (ROOT / 'research/pronunciation-asr.json').write_text(json.dumps(result, indent=1, ensure_ascii=False))
    print(json.dumps({k: v for k, v in result.items() if k != 'per_speaker'}, ensure_ascii=False))


if __name__ == '__main__':
    libs = list((Path(sys.prefix) / 'lib').glob('python*/site-packages/nvidia/*/lib'))
    if libs and not os.environ.get('VOICE_CUDA_READY'):
        env = {**os.environ, 'VOICE_CUDA_READY': '1', 'LD_LIBRARY_PATH': ':'.join(map(str, libs)) + ':' + os.environ.get('LD_LIBRARY_PATH', '')}
        os.execve(sys.executable, [sys.executable, *sys.argv], env)
    p = argparse.ArgumentParser(); p.add_argument('--cpu', action='store_true'); main(p.parse_args().cpu)
