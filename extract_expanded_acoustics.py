"""Expanded acoustic vector for the JVS benchmark clips, aligned to the clips.json of the benchmark output directory.

Adds phonation and spectral-shape measures the app's five do not carry: smoothed
cepstral peak prominence, long-term spectral tilt, uncorrected H1–H2, jitter,
shimmer, individual formant medians, and the frame-level variability of
formant spacing, harmonicity, spectral balance and H1–H2. Missing values stay
NaN; nothing is imputed for clips without reliable voicing. The Praat settings
follow the app's analysis (500 Hz pitch ceiling, CPPS searched over 60–500 Hz
with an exponential-decay trend) and therefore differ from the review-scale
study in evaluate_ratings.py, which uses the 60–330 Hz CPPS search and a
600 Hz ceiling.
"""
from pathlib import Path
import json, time, zipfile
from multiprocessing import Pool
import numpy as np
import parselmouth
from parselmouth.praat import call
import benchmark_jvs_similarity as bench
from acoustics import measure, RATE

OUT = bench.OUT
KEYS = ['f0_st', 'f0_sd_st', 'pitch_span', 'f1', 'f2', 'f3', 'delta_f', 'delta_f_sd', 'hnr', 'hnr_sd', 'balance', 'balance_sd',
        'cpps', 'tilt', 'h1h2', 'h1h2_sd', 'jitter', 'shimmer', 'voiced_fraction']
_zip = None


def h1h2(x, track):
    """Uncorrected H1–H2 per voiced frame from a 40 ms Hann window; median and SD over frames."""
    values = []
    for row in track:
        f0 = row.get('f0')
        if not f0: continue
        mid = int(row['t'] * RATE); frame = x[max(0, mid - 320):mid + 320]
        if len(frame) < 640: continue
        spec = 20 * np.log10(np.abs(np.fft.rfft((frame - frame.mean()) * np.hanning(len(frame)), n=4096)) + 1e-12); freq = np.fft.rfftfreq(4096, 1 / RATE)
        h1 = spec[(freq >= .8 * f0) & (freq <= 1.2 * f0)].max(); h2 = spec[(freq >= 1.8 * f0) & (freq <= 2.2 * f0)].max(); values.append(h1 - h2)
    return (float(np.median(values)), float(np.std(values))) if len(values) >= 5 else (np.nan, np.nan)


def features(row):
    global _zip
    if _zip is None: _zip = zipfile.ZipFile(bench.ZIP)
    x = bench.load(row, _zip).astype('float64'); m = measure(x, RATE, detailed=True); f = m['features']; out = dict.fromkeys(KEYS, np.nan)
    out['voiced_fraction'] = m['voicing']['voiced_fraction'] if 'voicing' in m else np.nan
    if not f: return out
    def sd(key):
        v = [r[key] for r in m['track'] if r.get(key) is not None]; return float(np.std(v)) if len(v) >= 5 else np.nan
    out.update(f0_st=12 * np.log2(f['f0']), f0_sd_st=f['pitch_sd_st'], pitch_span=f['pitch_span'], f1=f.get('f1', np.nan), f2=f.get('f2', np.nan), f3=f.get('f3', np.nan),
               delta_f=f.get('delta_f', np.nan), delta_f_sd=sd('delta_f'), hnr=f.get('hnr', np.nan), hnr_sd=sd('hnr'), balance=f.get('balance', np.nan), balance_sd=sd('balance'))
    out['h1h2'], out['h1h2_sd'] = h1h2(x, m['track'])
    sound = parselmouth.Sound(x, RATE)
    try:
        cep = call(sound, 'To PowerCepstrogram', 60, 0.002, 5000, 50)
        out['cpps'] = call(cep, 'Get CPPS', 'yes', 0.02, 0.0005, 60, 500, 0.05, 'Parabolic', 0.001, 0.05, 'Exponential decay', 'Robust')
    except Exception: pass
    try: out['tilt'] = call(call(sound, 'To Ltas', 100), 'Get slope', 0, 1000, 1000, 4000, 'energy')
    except Exception: pass
    try:
        points = call(sound, 'To PointProcess (periodic, cc)', 65, 500)
        out['jitter'] = call(points, 'Get jitter (local)', 0, 0, .0001, .02, 1.3); out['shimmer'] = call([sound, points], 'Get shimmer (local)', 0, 0, .0001, .02, 1.3, 1.6)
    except Exception: pass
    return out


def main():
    clips = json.loads((OUT / 'clips.json').read_text())['clips']; rows = bench.clip_table()
    assert [r['id'] for r in rows] == [c['id'] for c in clips], 'clip order differs from the cached benchmark'
    start = time.monotonic(); values = []
    with Pool(12) as pool:
        for i, out in enumerate(pool.imap(features, rows, chunksize=8)):
            values.append([out[k] for k in KEYS])
            if i % 500 == 0: print(i, '/', len(rows), round(time.monotonic() - start), 's', flush=True)
    values = np.array(values, 'float64'); np.savez(OUT / 'expanded.npz', keys=np.array(KEYS), values=values)
    modal = np.array([c['style'] == 'modal' and not c['id'].endswith('-archive') for c in clips])
    print('done', round(time.monotonic() - start), 's; modal clips with all keys finite:', float(np.isfinite(values[modal]).all(1).mean()), flush=True)
    print('per-key finite fraction (modal):', dict(zip(KEYS, np.round(np.isfinite(values[modal]).mean(0), 3).tolist())), flush=True)


if __name__ == '__main__': main()
