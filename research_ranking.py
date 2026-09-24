"""How the closest-to-you order should turn distances into a speaker ranking.

Uses the shipped timbre index (data/timbre-index-<version>.npz), the Japanese library's five
measures standardised the way the studio's AcousticSpace does it, and the JVS within-group
speaker-similarity ratings from research/jvs_ver1.zip. Two tasks:

- listener agreement: for each JVS speaker, up to five non-parallel clips each rank the other
  speakers of the same group; per-query Spearman against the rating row, averaged per query
  speaker, with a speaker bootstrap;
- held-out retrieval: over every Japanese speaker with at least four clips, one clip is held out
  and the speaker's remaining clips must win against every other speaker.

The blend is also scored the way the studio computes it (`app blend`): both distances are taken
to every speaker the index ranks for the language, synthetic voices included, from centroids of
all their indexed clips (the timbre centroid as the server builds it, the five-measure centre from
the same clips' measurable features), z-scored across that whole population, and only then used
to order the rated speakers.

Every reference speaker offers at most ten clips, drawn once with a fixed seed, so a nearest-clip
profile cannot win by having more chances. Aggregations: speaker centroid, nearest clip, mean of
the three nearest. The blend z-scores the timbre and five-measure centroid distances across the
candidate speakers of one query and mixes them with weight w on timbre.

    .venv/bin/python research_ranking.py        writes docs/research/ranking-library.json
"""
import hashlib, json, zipfile
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr
from perception import TIMBRE_VERSION

ROOT = Path(__file__).parent
DATA = ROOT / 'data'
KEYS = ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']
K = 10
WEIGHTS = [0.0, 0.25, 0.5, 0.75, 1.0]
rng = np.random.default_rng(0)


def raw5(f):
    f = f or {}
    return np.array([12 * np.log2(f['f0']) if f.get('f0') else np.nan] + [np.nan if f.get(k) is None else f[k] for k in KEYS[1:]], 'float64')


def acoustic_space(clips):
    """src/lib/space.ts: one representative clip per speaker (nearest its median f0 and ΔF), the
    median as centre, IQR / 1.349 as scale with the same floors."""
    by = {}
    for c in clips:
        if c.get('plotted') and not c.get('synthetic') and c.get('group') in ('female', 'male'): by.setdefault(c['speaker'], []).append(c)
    reps = []
    for g in by.values():
        f0 = np.median([c['features']['f0'] for c in g]); df = np.median([c['features']['delta_f'] for c in g])
        reps.append(min(g, key=lambda c: (c['features']['f0'] - f0) ** 2 + (c['features']['delta_f'] - df) ** 2))
    R = np.array([raw5(c['features']) for c in reps]); R = R[np.isfinite(R).all(1)]
    centre = np.median(R, 0)
    scale = np.maximum([1, 30, 2, 2, 1], (np.percentile(R, 75, 0) - np.percentile(R, 25, 0)) / 1.349)
    return lambda f: (raw5(f) - centre) / scale


def load():
    clips = json.load(open(DATA / 'native-ja.json'))['clips']
    z5 = acoustic_space(clips)
    index = np.load(DATA / f'timbre-index-{TIMBRE_VERSION}.npz')
    keep = (index['language'] == 'ja') & ~index['synthetic']
    pos = {i: k for k, i in enumerate(index['ids'][keep].tolist())}
    vectors = index['vectors'][keep].astype('float32')
    by = {}
    for c in clips:
        if c['id'] not in pos or c.get('synthetic'): continue
        f = z5(c['features'])
        if not np.isfinite(f).all(): continue
        v = vectors[pos[c['id']]]
        by.setdefault(c['speaker'], []).append({'id': c['id'], 'five': f, 'raw': v, 'unit': v / np.linalg.norm(v)})
    return by, z5


def app_population(z5):
    """What the studio blends over: per indexed speaker, the unit timbre centroid and the centre of
    the measurable five-measure vectors of the same clips (None without any)."""
    clips = {c['id']: c for c in json.load(open(DATA / 'native-ja.json'))['clips']}
    for name in ('voicevox.json', 'synthetic.json'):
        if (DATA / name).exists(): clips.update({c['id']: c for c in json.load(open(DATA / name))['clips'] if c.get('language') == 'ja'})
    index = np.load(DATA / f'timbre-index-{TIMBRE_VERSION}.npz'); keep = index['language'] == 'ja'
    by = {}
    for i, s, v in zip(index['ids'][keep].tolist(), index['speaker'][keep].tolist(), index['vectors'][keep].astype('float32')):
        if i in clips: by.setdefault(s, []).append((v, z5(clips[i]['features'])))
    out = {}
    for s, rows in by.items():
        c = np.mean([v for v, _ in rows], 0); f = [f for _, f in rows if np.isfinite(f).all()]
        out[s] = (c / np.linalg.norm(c), np.mean(f, 0) if f else None)
    return out


def app_blend(q, population, exclude, w):
    """src/lib/similar.ts: z-score each distance over the speakers that have it, then mix; a speaker
    without a five-measure centre keeps its timbre z-score."""
    names = [s for s in population if s != exclude]
    t = np.array([1 - population[s][0] @ q['unit'] for s in names]); zt = z(t)
    has = [population[s][1] is not None for s in names]
    f = np.array([np.linalg.norm(population[s][1] - q['five']) for s, h in zip(names, has) if h]); zf = z(f)
    it = iter(zf); score = {}
    for s, h, a in zip(names, has, zt): score[s] = w * a + (1 - w) * next(it) if h else a
    return score


def ratings():
    z = zipfile.ZipFile(ROOT / 'research/jvs_ver1.zip'); out = {}
    for g in ('female', 'male'):
        lines = z.read(f'jvs_ver1/speaker_similarity_{g}.csv').decode().split()
        out[g] = ([l.split(',')[0] for l in lines], np.array([[float(x) for x in l.split(',')[1:]] for l in lines]))
    return out


def distances(q, pool):
    """Every aggregation of both representations for one query against one speaker's clips."""
    c = np.mean([x['raw'] for x in pool], 0); t = np.sort([1 - x['unit'] @ q['unit'] for x in pool])
    f = np.sort([np.linalg.norm(x['five'] - q['five']) for x in pool])
    return {'timbre centroid': float(1 - (c / np.linalg.norm(c)) @ q['unit']), 'timbre nearest': float(t[0]), 'timbre top3': float(t[:3].mean()),
            'five centroid': float(np.linalg.norm(np.mean([x['five'] for x in pool], 0) - q['five'])), 'five nearest': float(f[0]), 'five top3': float(f[:3].mean())}


def z(d):
    return (d - d.mean()) / (d.std() + 1e-12)


def add_blends(table):
    """Blended scores, from the centroid distances z-scored across this query's candidates."""
    zt, z5 = z(np.array(table['timbre centroid'])), z(np.array(table['five centroid']))
    for w in WEIGHTS: table[f'blend {w:.2f}'] = list(w * zt + (1 - w) * z5)
    return table


def main():
    by, z5 = load()
    population = app_population(z5)
    refs = {s: [c[i] for i in rng.permutation(len(c))[:K]] for s, c in by.items()}
    methods = None
    agreement = {}  # method -> query speaker -> [rho]
    for g, (names, M) in ratings().items():
        for i, speaker in enumerate(names):
            queries = [c for c in by.get(speaker, []) if 'nonpara30' in c['id']]
            others = [(j, s) for j, s in enumerate(names) if s != speaker and s in refs]
            sim = np.array([M[i, j] for j, _ in others])
            for q in [queries[j] for j in rng.permutation(len(queries))[:5]]:
                rows = [distances(q, refs[s]) for _, s in others]
                table = add_blends({m: [r[m] for r in rows] for m in rows[0]})
                for w in WEIGHTS:
                    score = app_blend(q, population, speaker, w)
                    table[f'app blend {w:.2f}'] = [score[s] for _, s in others]
                methods = list(table)
                for m, d in table.items(): agreement.setdefault(m, {}).setdefault(speaker, []).append(spearmanr(-np.array(d), sim).statistic)
    speakers = sorted(agreement['timbre centroid'])
    mean_of = lambda m: np.array([np.mean(agreement[m][s]) for s in speakers])

    def boot(x, n=2000):
        return [float(v) for v in np.percentile([x[rng.integers(0, len(x), len(x))].mean() for _ in range(n)], [2.5, 97.5])]

    out = {'timbre_version': TIMBRE_VERSION, 'clips_per_profile': K, 'query_speakers': len(speakers), 'agreement': {}, 'paired': {}}
    for m in methods: x = mean_of(m); out['agreement'][m] = {'mean': float(x.mean()), 'ci95': boot(x)}
    for a, b in [('timbre centroid', 'five nearest'), ('timbre centroid', 'five centroid'), ('timbre nearest', 'five nearest'),
                 ('timbre nearest', 'timbre centroid'), ('timbre top3', 'timbre centroid'), ('five centroid', 'five nearest'),
                 ('blend 0.75', 'blend 1.00'), ('blend 0.50', 'blend 1.00'),
                 ('app blend 0.75', 'app blend 1.00'), ('app blend 0.50', 'app blend 1.00')]:
        x = mean_of(a) - mean_of(b); out['paired'][f'{a} - {b}'] = {'mean': float(x.mean()), 'ci95': boot(x)}
    out['held_out_weight'] = {}
    for prefix in ('blend', 'app blend'):
        gains, picks = [], []
        for _ in range(500):
            perm = rng.permutation(len(speakers)); a, b = perm[:len(speakers) // 2], perm[len(speakers) // 2:]
            best = max(WEIGHTS, key=lambda w: mean_of(f'{prefix} {w:.2f}')[a].mean())
            picks.append(best); gains.append(float((mean_of(f'{prefix} {best:.2f}') - mean_of(f'{prefix} 1.00'))[b].mean()))
        out['held_out_weight'][prefix] = {'splits': 500, 'median_gain': float(np.median(gains)), 'range95': [float(v) for v in np.percentile(gains, [2.5, 97.5])],
                                          'share_positive': float(np.mean(np.array(gains) > 0)), 'picked': {f'{w:.2f}': picks.count(w) for w in WEIGHTS if picks.count(w)}}

    candidates = [s for s, c in by.items() if len(c) >= 4]
    top1 = {}; rr = {}; overlap = {}
    for s in candidates:
        for qi in rng.permutation(len(by[s]))[:8]:
            q = by[s][qi]; own = [c for j, c in enumerate(by[s]) if j != qi][:K]
            rows = [distances(q, own if t == s else refs[t]) for t in candidates]
            table = add_blends({m: [r[m] for r in rows] for m in rows[0]})
            for w in WEIGHTS:
                # the held-out clip's own speaker competes with its remaining clips as its profile
                score = app_blend(q, {**population, s: (lambda c: (c / np.linalg.norm(c), np.mean([x['five'] for x in own], 0)))(np.mean([x['raw'] for x in own], 0))}, None, w)
                table[f'app blend {w:.2f}'] = [score[t] for t in candidates]
            me = candidates.index(s); others = [i for i in range(len(candidates)) if i != me]
            for m, d in table.items():
                d = np.array(d); rank = 1 + int((d[others] < d[me]).sum())
                top1.setdefault(m, []).append(rank == 1); rr.setdefault(m, []).append(1 / rank)
            top5 = lambda m: set(np.array(others)[np.argsort(np.array(table[m])[others])[:5]])
            for m in ('blend 0.50', 'blend 0.75', 'app blend 0.50', 'app blend 0.75'):
                base = 'app blend 1.00' if m.startswith('app') else 'timbre centroid'
                overlap.setdefault(m, []).append(len(top5(m) & top5(base)) / 5)
    out['retrieval'] = {'speakers': len(candidates), 'queries': len(top1['timbre centroid']),
                        'top1': {m: float(np.mean(v)) for m, v in top1.items()}, 'mrr': {m: float(np.mean(v)) for m, v in rr.items()},
                        'top5_shared_with_timbre': {m: float(np.mean(v)) for m, v in overlap.items()}}
    out['script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (ROOT / 'docs/research/ranking-library.json').write_text(json.dumps(out, indent=1) + '\n')
    for m in methods: a = out['agreement'][m]; print(f"{m:16s} agreement {a['mean']:+.3f} [{a['ci95'][0]:+.3f}, {a['ci95'][1]:+.3f}]  top-1 {100*out['retrieval']['top1'][m]:5.1f}%")
    for k, v in out['paired'].items(): print(f"{k}: {v['mean']:+.3f} [{v['ci95'][0]:+.3f}, {v['ci95'][1]:+.3f}]")
    print('held-out weight', out['held_out_weight']); print('top-5 shared', out['retrieval']['top5_shared_with_timbre'])


if __name__ == '__main__':
    main()
