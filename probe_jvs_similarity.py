"""Supervised-probe comparison on the cached JVS representations.

Reads the cache benchmark_jvs_similarity.py writes under its output directory. For
each candidate representation the metric progresses from the raw distance,
through training-fitted centering / PCA / scaling, to a non-negative diagonal
metric fitted on within-group speaker-pair ratings with ridge toward the
uniform metric. Everything is selected and fitted on training speakers only,
in nested speaker-level folds, and reported for held-out speakers: as
single non-parallel query clips ranked against the training reference
library (the per-speaker score is the mean over five drawn clips, and the
median is over speakers × repeats), and as centroid–centroid test pairs
(Spearman over the pairs of each test fold, averaged over folds). Whisper
and falsetto clips are never trained on; the fitted metric is re-scored on
them afterwards. Neural vectors are unit-normalised before every probe so
that the whitened and projected variants differ only in whitening.
"""
from pathlib import Path
import argparse, json, time
import numpy as np
import soundfile as sf
from scipy.optimize import nnls
from scipy.stats import rankdata
import benchmark_jvs_similarity as bench

ROOT = Path(__file__).parent
OUT = bench.OUT
FAMILIES = {'acoustic_five': ['acoustic_five'], 'acoustic_expanded': ['acoustic_expanded'], 'xvector': ['xvector'], 'early_layer': [f'L{l:02d}' for l in range(1, 7)]}
GRID = {'k': [8, 16, 32, 64], 'lam': [0.1, 1, 10, 100, 1000]}
# Whitened variants equalize PCA component variance before the metric; projected variants keep the raw geometry inside the subspace.
VARIANTS = ['raw', 'standardized', 'learned', 'learned+aug', 'projected', 'learned_projected', 'learned_projected+aug']
MATCHED = bench.MATCHED


def spearman(a, b):
    a = np.asarray(a, 'float64'); b = np.asarray(b, 'float64')
    if len(a) < 3 or np.isnan(a).any() or np.isnan(b).any() or a.std() == 0 or b.std() == 0: return float('nan')
    return float(np.corrcoef(rankdata(a), rankdata(b))[0, 1])


def sqdist(X, Y):
    return np.maximum(0, (X * X).sum(1)[:, None] + (Y * Y).sum(1)[None, :] - 2 * X @ Y.T)


class Data:
    def __init__(self):
        cache = np.load(OUT / 'cache.npz'); self.clips = json.loads((OUT / 'clips.json').read_text())['clips']
        self.speaker = np.array([c['speaker'] for c in self.clips]); self.subset = np.array([c['subset'] for c in self.clips])
        self.style = np.array([c['style'] for c in self.clips]); self.sentence = np.array([c['sentence'] for c in self.clips])
        self.archive = np.array([c['id'].endswith('-archive') for c in self.clips]); modal = (self.style == 'modal') & ~self.archive
        acoustic = cache['acoustic'].astype('float64'); acoustic[:, 0] = 12 * np.log2(acoustic[:, 0])
        self.reps = {'acoustic_five': acoustic, 'xvector': cache['xvector'].astype('float64')}
        for l in range(1, 7): self.reps[f'L{l:02d}'] = cache['sv_mean'][:, l].astype('float64')
        # The app's robust standardization of the acoustic five, fitted on all modal clips without ratings.
        ref = bench.standardize(cache['acoustic'], cache['acoustic'][modal]); self.scale = {'acoustic_five': np.nanstd(ref, axis=0) / np.nanstd(acoustic, axis=0)}
        if (OUT / 'expanded.npz').is_file():
            expanded = np.load(OUT / 'expanded.npz'); values = expanded['values'].astype('float64'); self.expanded_keys = expanded['keys'].tolist()
            # Same robust scaling on the expanded vector: median / IQR over modal clips, IQR floored at 1% of the median absolute value.
            iqr = np.nanquantile(values[modal], .75, axis=0) - np.nanquantile(values[modal], .25, axis=0)
            self.scale['acoustic_expanded'] = 1.349 / np.maximum(iqr, .01 * np.abs(np.nanmedian(values[modal], axis=0)) + 1e-9); self.reps['acoustic_expanded'] = values
        rated = bench.ratings(); self.group = {}; self.rating = {}
        for g, r in rated.items():
            for i, s in enumerate(r['speakers']): self.group[s] = g; self.rating[s] = (i, r['matrix'])
        self.speakers = sorted(self.group)
        self.parallel = {s: np.flatnonzero((self.speaker == s) & (self.subset == 'parallel100') & modal) for s in self.speakers}
        self.nonpara = {s: np.flatnonzero((self.speaker == s) & (self.subset == 'nonpara30') & modal) for s in self.speakers}
        self.centroids = {n: {s: np.nanmean(self.reps[n][self.parallel[s]], axis=0) for s in self.speakers} for n in self.reps}

    def similarity(self, a, b):
        ia, ma = self.rating[a]; ib, _ = self.rating[b]; return ma[ia, ib]

    def rating_matrix(self, speakers): return np.array([[self.similarity(a, b) for b in speakers] for a in speakers])

    def raw(self, name):
        if name.startswith('acoustic'):
            scale = self.scale[name]; return lambda X, Y: np.sqrt(sqdist(X * scale, Y * scale))
        def cosine(X, Y):
            X = X / np.linalg.norm(X, axis=1, keepdims=True); Y = Y / np.linalg.norm(Y, axis=1, keepdims=True); return np.maximum(0, 1 - X @ Y.T)
        return cosine


class Probe:
    """Training-fitted centering and PCA, optionally whitened; then a non-negative diagonal metric on the coordinates."""
    def __init__(self, k, lam, whiten=True, unit=False, pre=None): self.k, self.lam, self.whiten, self.unit, self.pre = k, lam, whiten, unit, pre

    def prepare(self, X):
        if self.unit: return X / np.linalg.norm(X, axis=1, keepdims=True)
        return X * self.pre if self.pre is not None else X

    def fit_space(self, X):
        X = self.prepare(X); self.mu = X.mean(0); U, S, Vt = np.linalg.svd(X - self.mu, full_matrices=False)
        self.P = Vt[:min(self.k, len(S))].T; Z = (X - self.mu) @ self.P; self.scale = Z.std(0) + 1e-9 if self.whiten else np.ones(Z.shape[1]); return self

    def z(self, X): return ((self.prepare(X) - self.mu) @ self.P) / self.scale

    def fit_metric(self, left, right, target, weight):
        """Ridge toward the uniform metric at the target's scale; lam=None keeps the uniform metric (the standardized control)."""
        A = (self.z(left) - self.z(right)) ** 2; t = np.asarray(target, 'float64'); w = np.asarray(weight, 'float64')
        self.w = np.full(A.shape[1], t.mean() / max(A.sum(1).mean(), 1e-9))
        if self.lam is None: return self
        sw = np.sqrt(w)[:, None]; ridge = np.sqrt(self.lam * len(A) / A.shape[1])
        self.w = nnls(np.vstack([A * sw, ridge * np.eye(A.shape[1])]), np.concatenate([t * sw[:, 0], ridge * self.w]))[0]
        return self

    def distance(self, X, Y):
        r = np.sqrt(self.w); return np.sqrt(sqdist(self.z(X) * r, self.z(Y) * r))


def training_pairs(data, name, speakers, rng, aug_draws):
    """Within-group speaker pairs on centroids, optionally augmented with single non-parallel clips against the other centroid."""
    C = data.centroids[name]; left, right, target, weight = [], [], [], []
    for i, a in enumerate(speakers):
        for b in speakers[i + 1:]:
            if data.group[a] != data.group[b]: continue
            t = 3 - data.similarity(a, b); left.append(C[a]); right.append(C[b]); target.append(t); weight.append(1.0)
            for _ in range(aug_draws):
                for q, r in [(a, b), (b, a)]:
                    clip = data.reps[name][rng.choice(data.nonpara[q])]
                    if np.isfinite(clip).all(): left.append(clip); right.append(C[r]); target.append(t); weight.append(0.5 / aug_draws)
    return np.array(left), np.array(right), np.array(target), np.array(weight)


def fit(data, name, variant, train, k, lam, rng):
    if variant == 'raw': return data.raw(name)
    left, right, target, weight = training_pairs(data, name, train, rng, 3 if variant.endswith('+aug') else 0)
    projected = 'projected' in variant
    probe = Probe(k, None if variant in ('standardized', 'projected') else lam, whiten=not projected, unit=not name.startswith('acoustic'), pre=data.scale.get(name))
    probe.fit_space(np.array([data.centroids[name][s] for s in train]))
    return probe.fit_metric(left, right, target, weight).distance


def query_scores(data, name, dist, queries, references, rng, draws):
    """Per-query Spearman between distance and rated similarity: single non-parallel clips, and the query's own centroid."""
    single, centroid = [], []
    for q in queries:
        refs = [r for r in references if data.group[r] == data.group[q]]; truth = np.array([data.similarity(q, r) for r in refs])
        R = np.array([data.centroids[name][r] for r in refs])
        clips = data.reps[name][rng.choice(data.nonpara[q], draws, replace=False)]; clips = clips[np.isfinite(clips).all(1)]
        single.append(float(np.nanmean([spearman(truth, -row) for row in dist(clips, R)])) if len(clips) else float('nan'))
        centroid.append(spearman(truth, -dist(data.centroids[name][q][None, :], R)[0]))
    return np.array(single), np.array(centroid)


def pair_scores(data, name, dist, speakers):
    out = {}
    for g in ['female', 'male']:
        members = [s for s in speakers if data.group[s] == g]; C = np.array([data.centroids[name][s] for s in members])
        iu = np.triu_indices(len(members), 1); out[g] = spearman(data.rating_matrix(members)[iu], -dist(C, C)[iu])
    return out


def folds(data, speakers, n, rng):
    parts = [[] for _ in range(n)]
    for g in ['female', 'male']:
        members = [s for s in speakers if data.group[s] == g]; rng.shuffle(members)
        for i, s in enumerate(members): parts[i % n].append(s)
    return parts


def grid(family, variant):
    names = FAMILIES[family]
    if variant == 'raw': return [(n, None, None) for n in names]
    if variant in ('standardized', 'projected'): return [(n, k, None) for n in names for k in GRID['k']]
    return [(n, k, lam) for n in names for k in GRID['k'] for lam in GRID['lam']]


def select(data, family, variant, train, rng):
    """Inner speaker folds; the criterion is the single-clip query ranking on inner held-out speakers."""
    options = grid(family, variant)
    if len(options) == 1: return options[0]
    inner = folds(data, list(train), 4, rng); best, best_score = None, -np.inf
    for n, k, lam in options:
        scores = []
        for i in range(4):
            held = inner[i]; fitted = [s for j, f in enumerate(inner) if j != i for s in f]
            single, _ = query_scores(data, n, fit(data, n, variant, fitted, k, lam, rng), held, fitted, rng, draws=3); scores.append(np.nanmean(single))
        if np.mean(scores) > best_score: best, best_score = (n, k, lam), float(np.mean(scores))
    return best


def sensitivity(data, name, dist):
    """Median distance ratios on the archive matched sentences: same-speaker whisper / falsetto against other text and other same-gender speaker."""
    X = data.reps[name]; idx = {(c['speaker'], c['style'], c['sentence']): i for i, c in enumerate(data.clips) if data.archive[i]}
    rows = {'whisper': [], 'falsetto': [], 'other_text': [], 'other_speaker': []}
    def d(i, j): return float(dist(X[i][None, :], X[j][None, :])[0, 0]) if np.isfinite(X[i]).all() and np.isfinite(X[j]).all() else np.nan
    for (s, st, sent), i in idx.items():
        if st != 'modal': continue
        for alt in ['whisper', 'falsetto']:
            if (s, alt, sent) in idx: rows[alt].append(d(i, idx[(s, alt, sent)]))
        for other in MATCHED:
            if other != sent and (s, 'modal', other) in idx: rows['other_text'].append(d(i, idx[(s, 'modal', other)]))
        for t in data.speakers:
            if t != s and data.group[t] == data.group[s] and (t, 'modal', sent) in idx: rows['other_speaker'].append(d(i, idx[(t, 'modal', sent)]))
    med = {k: float(np.nanmedian(v)) for k, v in rows.items()}
    return {f'{a}_over_{b}': med[a] / med[b] for a in ['whisper', 'falsetto'] for b in ['other_text', 'other_speaker']}


def run(seed=0, outer=5, repeats=2, variants=VARIANTS, tag='probe', families=None):
    data = Data(); rng = np.random.default_rng(seed); start = time.monotonic()
    durations = [sf.info(ROOT / 'data/samples' / (data.clips[i]['id'] + '.flac')).duration for s in data.speakers[::5] for i in data.nonpara[s][:5]]
    meta = json.loads((OUT / 'clips.json').read_text())
    result = {'nonpara_query_duration_s': {'median': float(np.median(durations)), 'p10': float(np.percentile(durations, 10)), 'p90': float(np.percentile(durations, 90))},
              **{k: meta[k] for k in ['sv_revision', 'acoustics_version', 'library_engine_version', 'padding'] if k in meta},
              'protocol': {'outer_folds': outer, 'repeats': repeats, 'inner_folds': 4, 'grid': GRID, 'query_draws': 5, 'aug_draws': 3},
              'variants': {}, 'chosen': {}, 'sensitivity': {}, 'paired_raw_delta': {}}
    families = [f for f in (families or FAMILIES) if FAMILIES[f][0] in data.reps]
    for family in families:
        for variant in variants:
            single_all, centroid_all, pair_all, chosen = [], [], {'female': [], 'male': []}, []
            for _ in range(repeats):
                parts = folds(data, list(data.speakers), outer, rng)
                for i in range(outer):
                    test = parts[i]; train = [s for j, f in enumerate(parts) if j != i for s in f]
                    n, k, lam = select(data, family, variant, train, rng); chosen.append([n, k, lam])
                    dist = fit(data, n, variant, train, k, lam, rng)
                    single, centroid = query_scores(data, n, dist, test, train, rng, draws=5); single_all.extend(single); centroid_all.extend(centroid)
                    for g, v in pair_scores(data, n, dist, test).items(): pair_all[g].append(v)
            key = f'{family}/{variant}'
            result['variants'][key] = {'query_single_median': float(np.nanmedian(single_all)), 'query_single_p10': float(np.nanpercentile(single_all, 10)),
                                       'query_centroid_median': float(np.nanmedian(centroid_all)), 'query_centroid_p10': float(np.nanpercentile(centroid_all, 10)),
                                       'pair_female': float(np.nanmean(pair_all['female'])), 'pair_male': float(np.nanmean(pair_all['male']))}
            result['chosen'][key] = chosen; v = result['variants'][key]
            print(f"{key:26s} single {v['query_single_median']:+.3f} p10 {v['query_single_p10']:+.3f}  centroid {v['query_centroid_median']:+.3f} p10 {v['query_centroid_p10']:+.3f}  pairs f {v['pair_female']:+.3f} m {v['pair_male']:+.3f}  {round(time.monotonic() - start)}s", flush=True)

    # Paired raw comparison against the x-vector under shared speaker subsamples (centroid–centroid, every speaker).
    for g in ['female', 'male']:
        members = [s for s in data.speakers if data.group[s] == g]; M = data.rating_matrix(members)
        D = {n: data.raw(n)(np.array([data.centroids[n][s] for s in members]), np.array([data.centroids[n][s] for s in members])) for n in [c for c in ['acoustic_five', 'acoustic_expanded', 'xvector', 'L02', 'L03'] if c in data.reps]}
        deltas = {n: [] for n in D if n != 'xvector'}
        for _ in range(1000):
            idx = rng.choice(len(members), len(members), replace=True); a, b = bench.bootstrap_pairs(idx); truth = M[idx[a], idx[b]]
            base = spearman(truth, -D['xvector'][idx[a], idx[b]])
            for n in deltas: deltas[n].append(spearman(truth, -D[n][idx[a], idx[b]]) - base)
        result['paired_raw_delta'][g] = {n: {'mean': float(np.mean(v)), 'ci95': [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]} for n, v in deltas.items()}
    print('paired raw delta vs xvector:', json.dumps(result['paired_raw_delta']), flush=True)

    # Sensitivity of the learned metric, fitted on every speaker with the most often chosen hyperparameters.
    learned = [v for v in variants if v.startswith('learned') and not v.endswith('+aug')]
    for family in families:
        for variant in learned:
            picks = [tuple(p) for p in result['chosen'][f'{family}/{variant}']]; n, k, lam = max(set(picks), key=picks.count)
            for mode in ['raw', variant]:
                s = sensitivity(data, n, fit(data, n, mode, data.speakers, k, lam, rng)); result['sensitivity'][f'{family}/{mode}'] = {'representation': n, 'k': k, 'lam': lam, **s}
                print(f'sensitivity {family}/{mode} ({n}, k={k}, lam={lam}):', {key: round(v, 2) for key, v in s.items()}, flush=True)
    (OUT / f'{tag}.json').write_text(json.dumps(result, indent=1)); print('done', round(time.monotonic() - start), 's', flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--seed', type=int, default=0); p.add_argument('--repeats', type=int, default=2)
    p.add_argument('--variants', default=','.join(VARIANTS)); p.add_argument('--families', default=None); p.add_argument('--tag', default='probe'); a = p.parse_args()
    run(seed=a.seed, repeats=a.repeats, variants=a.variants.split(','), tag=a.tag, families=a.families.split(',') if a.families else None)
