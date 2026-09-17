"""Audit of pitch tracking on the JVS whisper and falsetto clips of the matched sentences.

Produces the numbers behind the extractor section of docs/research/jvs-similarity.md:

- per clip, for the five sentences shared by parallel100, whisper10 and falset10:
  the tracked pitch, the sparse-voicing verdict of acoustics.measure, and the share
  of voiced frames whose odd harmonics of the tracked pitch are missing (the same
  rule as ``pitch_halving_pct`` in #62, computed here so the audit does not depend
  on that change);
- the falsetto/modal pitch ratio per speaker and sentence, and how many of the
  "barely changed" pairs are flagged as halved;
- per frame, agreement of the halving rule with a second Praat pass at a 1000 Hz
  ceiling, a higher-ceiling reference rather than an annotation of the fundamental.

Runs in the app environment (.venv) on twelve processes.
"""
from pathlib import Path
import io, json, re, zipfile
from multiprocessing import Pool
import numpy as np
import soundfile as sf
import parselmouth
import benchmark_jvs_similarity as bench
from acoustics import measure, mono16, RATE, STEP

OUT = bench.OUT; ZIP = bench.ZIP
_zip = None


def spectrum_peak(spec, freq, hz):
    return float(10 * np.log10(spec[np.abs(freq - hz) <= max(.06 * hz, RATE / 2048)].max() + 1e-20))


def audit(name):
    global _zip
    if _zip is None: _zip = zipfile.ZipFile(ZIP)
    x, r = sf.read(io.BytesIO(_zip.read(name)), dtype='float64'); x = mono16(x, r)
    sound = parselmouth.Sound(x, RATE)
    low = sound.to_pitch_ac(time_step=STEP, pitch_floor=65, pitch_ceiling=500, very_accurate=True, voicing_threshold=0.5)
    high = sound.to_pitch_ac(time_step=STEP, pitch_floor=65, pitch_ceiling=1000, very_accurate=True, voicing_threshold=0.5)
    f0 = low.selected_array['frequency']; strength = low.selected_array['strength']; times = low.xs()
    db = np.array([20 * np.log10(np.sqrt(np.mean(x[max(0, int(t * RATE) - 400):int(t * RATE) + 400] ** 2)) + 1e-12) for t in times])
    threshold = max(-55., float(np.quantile(db, .95)) - 35.); voiced = (f0 > 0) & (strength >= .65) & (db > threshold)
    frames = []  # (halved by the rule, halved by the reference, same pitch in the reference)
    for i, t in enumerate(times):
        if not voiced[i]: continue
        mid = int(t * RATE); f = x[max(0, mid - 400):min(len(x), mid + 400)]; f = f - f.mean()
        spec = np.abs(np.fft.rfft(f * np.hanning(len(f)), n=2048)) ** 2; freq = np.fft.rfftfreq(2048, 1 / RATE)
        h = [spectrum_peak(spec, freq, k * f0[i]) for k in range(1, 7)]; flag = bool(np.mean(h[1::2]) - np.mean(h[0::2]) > 10)
        hf = high.get_value_at_time(t); twice = bool(np.isfinite(hf) and hf > 0 and abs(hf / f0[i] - 2) < .1); same = bool(np.isfinite(hf) and hf > 0 and abs(hf / f0[i] - 1) < .05)
        frames.append((flag, twice, same))
    m = measure(x, RATE); speaker, subset, sentence = re.search(r'/(jvs\d{3})/(\w+)/wav24kHz16bit/(\w+)\.wav$', name).groups()
    return {'speaker': speaker, 'subset': subset, 'sentence': sentence, 'f0': m['features'].get('f0'), 'sparse': m['voicing']['sparse'], 'voiced_seconds': m['voiced_seconds'],
            'halving_pct': round(100 * float(np.mean([f[0] for f in frames])), 1) if frames else None, 'frames': frames}


def main():
    with zipfile.ZipFile(ZIP) as z:
        names = [n for n in z.namelist() if re.search(r'/(parallel100|whisper10|falset10)/wav24kHz16bit/VOICEACTRESS100_00[1-5]\.wav$', n)]
    with Pool(12) as pool: rows = pool.map(audit, names, chunksize=8)
    result = {'acoustics_version': __import__('acoustics').VERSION, 'clips': {}, 'rule_vs_higher_ceiling_reference': {}}
    for subset, style in [('parallel100', 'modal'), ('whisper10', 'whisper'), ('falset10', 'falsetto')]:
        v = [r for r in rows if r['subset'] == subset]; h = np.array([r['halving_pct'] for r in v if r['halving_pct'] is not None]); f0 = np.array([r['f0'] for r in v if r['f0']])
        result['clips'][style] = {'clips': len(v), 'withheld_by_sparse_gate': sum(r['sparse'] for r in v), 'reported_median_voiced_seconds': float(np.median([r['voiced_seconds'] for r in v if not r['sparse']])) if any(not r['sparse'] for r in v) else None,
                                  'tracked_f0_p50_p90_max': [round(float(np.percentile(f0, q)), 1) for q in (50, 90, 100)] if len(f0) else None,
                                  'halving_pct_p50_p90_max': [round(float(np.percentile(h, q)), 1) for q in (50, 90, 100)] if len(h) else None, 'clips_over_20pct': int((h > 20).sum()) if len(h) else 0}
        fr = np.array([f for r in v for f in r['frames']]) if any(r['frames'] for r in v) else np.zeros((0, 3), bool)
        if len(fr):
            flag, twice, same = fr[:, 0], fr[:, 1], fr[:, 2]; tp = int((flag & twice).sum()); fn = int((~flag & twice).sum()); fp = int((flag & same).sum()); tn = int((~flag & same).sum())
            result['rule_vs_higher_ceiling_reference'][style] = {'voiced_frames': int(len(fr)), 'reference_twice': int(twice.sum()), 'reference_same': int(same.sum()),
                                                                  'sensitivity': round(tp / max(1, tp + fn), 3), 'specificity': round(tn / max(1, tn + fp), 3)}
    modal = {(r['speaker'], r['sentence']): r for r in rows if r['subset'] == 'parallel100'}
    pairs = [(r, modal[(r['speaker'], r['sentence'])]) for r in rows if r['subset'] == 'falset10' and (r['speaker'], r['sentence']) in modal and r['f0'] and modal[(r['speaker'], r['sentence'])]['f0']]
    ratios = np.array([a['f0'] / b['f0'] for a, b in pairs]); barely = [a for a, b in pairs if a['f0'] / b['f0'] < 1.15]
    flagged = [r for r in rows if r['subset'] == 'falset10' and r['halving_pct'] is not None and r['halving_pct'] > 20]
    result['falsetto_vs_modal'] = {'pairs': len(pairs), 'f0_ratio_p10_p50_p90': [round(float(np.percentile(ratios, q)), 2) for q in (10, 50, 90)], 'pairs_under_1_15': len(barely),
                                   'of_which_halving_over_20pct': sum(r['halving_pct'] > 20 for r in barely if r['halving_pct'] is not None),
                                   'flagged_clips_tracked_f0_p25_p50_p75': [round(float(np.percentile([r['f0'] for r in flagged], q))) for q in (25, 50, 75)] if flagged else None}
    for r in rows: r.pop('frames')
    (OUT / 'halving-audit.json').write_text(json.dumps({**result, 'rows': rows}, indent=1)); print(json.dumps({k: v for k, v in result.items()}, indent=1))


if __name__ == '__main__': main()
