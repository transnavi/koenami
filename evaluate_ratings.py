"""How much of the listening ratings can be predicted from audio, and how reliable are they?

Reads curation/reviews.jsonl (clip records only; prefilled 追加項目 records are excluded from modelling),
measures an expanded acoustic set per rated clip with Praat through parselmouth (cached in
research/rating-features.json), then reports, per scale:

- test-retest reliability from blind same-clip repeats (ICC(1,1) and mean absolute difference),
- speaker consistency from blind different-clip repeats,
- held-out prediction from the five map features and from the expanded set: ridge with a nested alpha,
  repeated speaker-grouped 5-fold CV, Spearman and R² with a permutation null,
- a PLS latent of 2–3 components fitted to all scales at once, scored the same way.

Numbers are printed as JSON and written to research/rating-evaluation.json. Nothing here changes the app.
"""
import json
import sys
import warnings
from pathlib import Path

import numpy as np
import parselmouth
from parselmouth.praat import call
from scipy.stats import spearmanr
from sklearn.cross_decomposition import PLSRegression
from sklearn.linear_model import Ridge
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

import curation

ROOT = Path(__file__).parent
CACHE = ROOT / 'research/rating-features.json'
FIVE = ['f0_st', 'delta_f', 'hnr', 'balance', 'pitch_span']
FEATURE_VERSION = 'praat-v1'


def measure(path):
    """Expanded acoustic descriptors of one clip. Medians over voiced frames unless stated."""
    snd = parselmouth.Sound(str(path)).convert_to_mono()
    pitch = snd.to_pitch(time_step=.01, pitch_floor=65, pitch_ceiling=600)
    f0 = pitch.selected_array['frequency']; voiced = f0[f0 > 0]
    if len(voiced) < 20: return None
    st = 12 * np.log2(voiced)
    times = pitch.xs()[f0 > 0]
    slope = float(np.polyfit(times - times[0], st, 1)[0]) if len(voiced) > 30 else 0.0
    point = call(snd, 'To PointProcess (periodic, cc)', 65, 600)
    jitter = call(point, 'Get jitter (local)', 0, 0, .0001, .02, 1.3)
    shimmer = call([snd, point], 'Get shimmer (local)', 0, 0, .0001, .02, 1.3, 1.6)
    harm = call(snd, 'To Harmonicity (cc)', .01, 65, .1, 1.0)
    hnr = call(harm, 'Get mean', 0, 0)
    formant = snd.to_formant_burg(time_step=.01, max_number_of_formants=5, maximum_formant=5500)
    F = []
    for t in times:
        F.append([formant.get_value_at_time(i, t) for i in (1, 2, 3)])
    F = np.array(F, float); F = F[~np.isnan(F).any(1)]
    f1, f2, f3 = (np.median(F, 0) if len(F) else (np.nan,) * 3)
    delta_f = float((f1 / .5 + f2 / 1.5 + f3 / 2.5) / 3) if len(F) else np.nan
    spec = snd.to_spectrum()
    def band(lo, hi): return call(spec, 'Get band energy', lo, hi)
    balance = 10 * np.log10(max(band(1000, 4000), 1e-12) / max(band(0, 1000), 1e-12))
    tilt_high = 10 * np.log10(max(band(4000, 8000), 1e-12) / max(band(0, 1000), 1e-12))
    # H1-H2 from the long-term spectrum at the median f0 and its second harmonic (breathiness proxy).
    med = float(np.median(voiced))
    ltas = call(snd, 'To Ltas', 20)
    h1 = call(ltas, 'Get value at frequency', med, 'Cubic'); h2 = call(ltas, 'Get value at frequency', 2 * med, 'Cubic')
    cpps = np.nan
    try:
        cep = call(snd, 'To PowerCepstrogram', 60, .002, 5000, 50)
        cpps = call(cep, 'Get CPPS', 'no', .01, .001, 60, 330, .05, 'Parabolic', .001, 0, 'Straight', 'Robust')
    except Exception: pass
    intensity = snd.to_intensity(minimum_pitch=65, time_step=.01)
    iv = intensity.values[0]; iv = iv[np.isfinite(iv)]
    quiet = float(np.mean(iv < (iv.max() - 25))) if len(iv) else np.nan
    # Syllable-rate proxy: intensity peaks above the median, at least 120 ms apart, per second of speech.
    peaks = 0
    if len(iv) > 20:
        thr = np.median(iv); last = -1
        for i in range(1, len(iv) - 1):
            if iv[i] > thr and iv[i] >= iv[i - 1] and iv[i] > iv[i + 1] and i - last > 12: peaks += 1; last = i
    speech_seconds = float(len(voiced) * .01)
    return {'f0_st': float(np.median(st)), 'f0_sd_st': float(np.std(st)), 'f0_p10_st': float(np.percentile(st, 10)), 'f0_p90_st': float(np.percentile(st, 90)),
            'pitch_span': float(np.percentile(st, 90) - np.percentile(st, 10)), 'f0_slope_st_s': slope,
            'delta_f': delta_f, 'f1': float(f1), 'f2': float(f2), 'f3': float(f3), 'hnr': float(hnr), 'cpps': float(cpps), 'h1h2': float(h1 - h2),
            'jitter': float(jitter), 'shimmer': float(shimmer), 'balance': float(balance), 'tilt_high': float(tilt_high),
            'quiet_frac': quiet, 'peaks_per_s': peaks / max(snd.duration, .1), 'voiced_frac': speech_seconds / max(snd.duration, .1),
            'duration': float(snd.duration)}


def features_for(clips):
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    changed = False
    for clip in clips:
        if cache.get(clip, {}).get('version') == FEATURE_VERSION: continue
        path = next((p for p in (ROOT / 'data/samples').glob(clip + '.*')), None)
        if not path: continue
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            try: f = measure(path)
            except Exception as error: f = None; print('measure failed', clip, type(error).__name__, file=sys.stderr)
        cache[clip] = {'version': FEATURE_VERSION, 'features': f}; changed = True
    if changed:
        CACHE.parent.mkdir(exist_ok=True); CACHE.write_text(json.dumps(cache))
    return {c: cache[c]['features'] for c in clips if cache.get(c, {}).get('features')}


def icc1(a, b):
    """ICC(1,1) for two ratings of the same items."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    n = len(a)
    if n < 3: return np.nan
    grand = np.mean(np.concatenate([a, b])); means = (a + b) / 2
    msb = 2 * np.sum((means - grand) ** 2) / (n - 1)
    msw = np.sum((a - means) ** 2 + (b - means) ** 2) / n
    return float((msb - msw) / (msb + msw)) if msb + msw else np.nan


def reliability(records, keys):
    by_clip, by_speaker = {}, {}
    for r in records:
        by_clip.setdefault(r['clip'], []).append(r); by_speaker.setdefault(r['speaker'], []).append(r)
    out = {}
    for key in keys:
        same = [(o['ratings'][key], rep['ratings'][key]) for rows in by_clip.values() for o in rows if o.get('mode', 'new') == 'new' and key in o['ratings']
                for rep in rows if rep.get('mode') == 'repeat' and rep is not o and key in rep['ratings']]
        other = [(o['ratings'][key], rep['ratings'][key]) for rows in by_speaker.values() for o in rows if o.get('mode', 'new') == 'new' and key in o['ratings']
                 for rep in rows if rep.get('mode') == 'speaker_repeat' and rep['clip'] != o['clip'] and key in rep['ratings']]
        out[key] = {'same_clip_pairs': len(same), 'same_clip_icc': icc1(*zip(*same)) if len(same) >= 3 else None,
                    'same_clip_mad': float(np.mean([abs(a - b) for a, b in same])) if same else None,
                    'other_clip_pairs': len(other), 'other_clip_icc': icc1(*zip(*other)) if len(other) >= 3 else None}
    return out


def held_out(model_factory, X, y, groups, repeats=10, seed=0):
    """Repeated speaker-grouped 5-fold CV; returns per-repeat Spearman and R²."""
    rho, r2 = [], []
    for rep in range(repeats):
        rng = np.random.RandomState(seed + rep); order = rng.permutation(len(y))
        pred = np.zeros_like(y)
        for tr, te in GroupKFold(n_splits=5).split(X[order], y[order], groups[order]):
            tr, te = order[tr], order[te]
            model = model_factory(); model.fit(X[tr], y[tr]); pred[te] = np.ravel(model.predict(X[te]))
        rho.append(spearmanr(y, pred).correlation); r2.append(1 - np.sum((y - pred) ** 2) / np.sum((y - y.mean()) ** 2))
    return float(np.nanmedian(rho)), float(np.nanmedian(r2))


def ridge_factory(alpha):
    return lambda: make_pipeline(StandardScaler(), Ridge(alpha=alpha))


def nested_ridge(X, y, groups):
    """Pick alpha inside the training folds, score outside."""
    alphas = np.logspace(-1, 4, 11)
    rho, r2 = [], []
    for rep in range(5):
        rng = np.random.RandomState(rep); order = rng.permutation(len(y)); pred = np.zeros_like(y)
        for tr, te in GroupKFold(n_splits=5).split(X[order], y[order], groups[order]):
            tr, te = order[tr], order[te]
            best, best_score = alphas[0], -np.inf
            for a in alphas:
                inner = np.zeros(len(tr))
                for itr, ite in GroupKFold(n_splits=4).split(X[tr], y[tr], groups[tr]):
                    m = ridge_factory(a)(); m.fit(X[tr][itr], y[tr][itr]); inner[ite] = m.predict(X[tr][ite])
                score = -np.sum((y[tr] - inner) ** 2)
                if score > best_score: best, best_score = a, score
            m = ridge_factory(best)(); m.fit(X[tr], y[tr]); pred[te] = m.predict(X[te])
        rho.append(spearmanr(y, pred).correlation); r2.append(1 - np.sum((y - pred) ** 2) / np.sum((y - y.mean()) ** 2))
    return float(np.nanmedian(rho)), float(np.nanmedian(r2))


def permutation_null(X, y, groups, n=100, seed=0):
    rng = np.random.RandomState(seed); rhos = []
    for _ in range(n):
        ys = rng.permutation(y); rho, _ = held_out(ridge_factory(10.0), X, ys, groups, repeats=1, seed=rng.randint(1 << 30)); rhos.append(rho)
    return float(np.nanpercentile(rhos, 95))


def main():
    records = [r for r in curation.load() if r.get('clip') and r['ratings'] and r.get('mode', 'new') != 'update' and not r['flags']]
    keys = [s['key'] for s in curation.SCALES]
    result = {'records': len(records), 'reliability': reliability(records, keys)}
    latest = {}
    for r in records:
        if r.get('mode', 'new') == 'new': latest[r['clip']] = r
    feats = features_for(sorted(latest))
    names = [k for k in next(iter(feats.values())) if k != 'duration'] if feats else []
    clips = [c for c in latest if c in feats and all(np.isfinite(feats[c][n]) for n in names)]
    X_all = np.array([[feats[c][n] for n in names] for c in clips], float)
    X_five = np.array([[feats[c][n] for n in FIVE] for c in clips], float)
    groups = np.array([latest[c]['speaker'] for c in clips])
    result['clips_with_features'] = len(clips); result['speakers'] = len(set(groups)); result['features'] = names
    scales = {}
    for key in keys:
        if key == 'age': continue
        m = np.array([key in latest[c]['ratings'] for c in clips])
        y = np.array([latest[c]['ratings'].get(key, np.nan) for c in clips], float)[m]
        if m.sum() < 30 or np.std(y) == 0: continue
        five = nested_ridge(X_five[m], y, groups[m]); full = nested_ridge(X_all[m], y, groups[m])
        null95 = permutation_null(X_all[m], y, groups[m], n=60)
        cors = {n: float(spearmanr(X_all[m][:, i], y).correlation) for i, n in enumerate(names)}
        top = sorted(cors.items(), key=lambda kv: -abs(kv[1]))[:4]
        scales[key] = {'n': int(m.sum()), 'five': {'rho': five[0], 'r2': five[1]}, 'expanded': {'rho': full[0], 'r2': full[1]},
                       'null95_rho': null95, 'top_correlates': top}
    result['scales'] = scales
    # PLS across all scales at once on clips that have every non-age scale.
    full_keys = [k for k in keys if k != 'age']
    full = np.array([all(k in latest[c]['ratings'] for k in full_keys) for c in clips])
    if full.sum() >= 40:
        Y = np.array([[latest[c]['ratings'][k] for k in full_keys] for c in np.array(clips)[full]], float)
        Xf = X_all[full]; gf = groups[full]
        pls = {}
        for comps in (2, 3):
            rho_per = {}
            pred = np.zeros_like(Y)
            for tr, te in GroupKFold(n_splits=5).split(Xf, Y, gf):
                m = make_pipeline(StandardScaler(), PLSRegression(n_components=comps)); m.fit(Xf[tr], Y[tr]); pred[te] = m.predict(Xf[te])
            for i, k in enumerate(full_keys): rho_per[k] = float(spearmanr(Y[:, i], pred[:, i]).correlation)
            m = make_pipeline(StandardScaler(), PLSRegression(n_components=comps)); m.fit(Xf, Y)
            load = m.named_steps['plsregression'].x_weights_
            pls[str(comps)] = {'held_out_rho': rho_per, 'x_weights': {f'c{j + 1}': {n: round(float(load[i, j]), 3) for i, n in enumerate(names)} for j in range(comps)}}
        result['pls'] = {'clips': int(full.sum()), **pls}
    (ROOT / 'research').mkdir(exist_ok=True)
    (ROOT / 'research/rating-evaluation.json').write_text(json.dumps(result, indent=1, ensure_ascii=False, default=float))
    print(json.dumps(result, ensure_ascii=False, default=float))


if __name__ == '__main__':
    main()
