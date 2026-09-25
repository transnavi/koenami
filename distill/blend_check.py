"""The studio's blend (src/lib/similar.ts) on both descriptors, queries from held-out JVS speakers only."""
import json, sys
import numpy as np
from scipy.stats import spearmanr
sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parent.parent))
import research_ranking as rr
held = set(json.load(open('research/distill/split.json'))['held_jvs'])
rng = np.random.default_rng(0)
out = {}
for version in ('wavlm-l3-int8-v2', 'student-l3-v1'):
    rr.TIMBRE_VERSION = version
    by, z5 = rr.load(); pop = rr.app_population(z5)
    per = {w: [] for w in (0.0, 0.5, 0.75, 1.0)}
    for g, (names, M) in rr.ratings().items():
        for i, s in enumerate(names):
            if s not in held: continue
            qs = [c for c in by.get(s, []) if 'nonpara30' in c['id']][:5]
            others = [(j, t) for j, t in enumerate(names) if t != s and t in pop]
            for w in per:
                vals = []
                for q in qs:
                    score = rr.app_blend(q, pop, s, w)
                    vals.append(spearmanr(-np.array([score[t] for _, t in others]), M[i, [j for j, _ in others]]).statistic)
                if vals: per[w].append(np.mean(vals))
    out[version] = {w: np.array(v) for w, v in per.items()}
for version, per in out.items():
    line = [f'w={w}: {v.mean():.3f}' for w, v in per.items()]
    d = per[0.75] - per[1.0]; draws = [d[rng.integers(0, len(d), len(d))].mean() for _ in range(2000)]
    print(version, len(per[1.0]), 'speakers |', ', '.join(line), f'| 0.75 − 1.0: {d.mean():+.3f} [{np.percentile(draws,2.5):+.3f}, {np.percentile(draws,97.5):+.3f}]')
