"""Do the ranking's representations follow a deliberate change of voice?

1. JVS: each speaker reads VOICEACTRESS100_001-005 in modal voice, falsetto and whisper (from
   research/jvs_ver1.zip). For a query clip A-X (voice A, sentence X) the test is
   d(A-X, A-Y) < d(A-X, B-X), the same voice on another sentence closer than the same sentence
   in another voice; and, as retrieval, whether the nearest of the speaker's other clips is in
   the query's own voice. The blend z-scores both distances over those other clips.
2. Versatile Voice Dataset (Netzorg et al.): three speakers say "hit" and "key" in up to 27
   settings of pitch, resonance and weight (low / med / high). Each setting becomes one clip,
   hit then key with a 0.3 s gap after each, so the words never change within a speaker. For
   every pair of one speaker's settings, the distance is set against the steps apart on each
   dimension. The audio has no stated licence: research/vvd/ holds a local copy
   (`--fetch-vvd`), used for analysis only and never redistributed.

Representations: perception.timbre (the shipped descriptor), the x-vector (perception.windows,
three trimmed 4 s windows, the deployed identity descriptor) and the five measures from the
measurement engine standardised as the studio does. Features are cached per clip under
research/voice-changes/.

    .venv/bin/python research_voice_changes.py [--fetch-vvd]
                                        writes docs/research/ranking-voice-changes.json
"""
import argparse, hashlib, itertools, json, subprocess, zipfile
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.stats import spearmanr
import perception, engine
from acoustics import mono16
from research_ranking import load

ROOT = Path(__file__).parent
CACHE = ROOT / 'research/voice-changes'
VVD = ROOT / 'research/vvd'
VVD_REPO = 'Berkeley-Speech-Group/VersatileVoiceDataset'
CONFIG = {'parallel100': 'modal', 'falset10': 'falsetto', 'whisper10': 'whisper'}
SENTENCES = [f'VOICEACTRESS100_00{i}' for i in range(1, 6)]
STEP = {'low': 0, 'med': 1, 'high': 2}


def features(paths):
    """Timbre, x-vector and five measures per file, cached by file name."""
    CACHE.mkdir(parents=True, exist_ok=True)
    store = CACHE / 'features.npz'
    have = dict(np.load(store, allow_pickle=True)['rows'].item()) if store.exists() else {}
    todo = [p for p in paths if p.stem not in have]
    five = {}
    if todo:
        try: five = engine.measure_files(todo)
        except engine.MeasureError as e: five = e.measured
    for n, p in enumerate(todo):
        x, rate = sf.read(p, dtype='float32'); x = mono16(x, rate).astype('float32'); row = {}
        try: row['timbre'] = perception.timbre(x)
        except ValueError: pass
        try: row['xvec'] = np.mean([perception.session('wavlm').run(None, {'values': w})[0][0] for w in perception.windows(x)], axis=0)
        except ValueError: pass
        row['five'] = (five.get(str(p)) or {}).get('features')
        have[p.stem] = row
        if n % 100 == 99: np.savez(store, rows=np.array(have, dtype=object)); print(n + 1, '/', len(todo), flush=True)
    np.savez(store, rows=np.array(have, dtype=object))
    return {p.stem: have[p.stem] for p in paths}


def unit(v): return None if v is None else v / np.linalg.norm(v)


def representations(rows, z5):
    cos = lambda a, b: float(1 - a @ b)
    out = {'timbre': {}, 'x-vector': {}, 'five': {}}
    for k, r in rows.items():
        if r.get('timbre') is not None: out['timbre'][k] = unit(r['timbre'])
        if r.get('xvec') is not None: out['x-vector'][k] = unit(r['xvec'])
        f = z5(r.get('five'))
        if np.isfinite(f).all(): out['five'][k] = f
    return out, {'timbre': cos, 'x-vector': cos, 'five': lambda a, b: float(np.linalg.norm(a - b))}


def jvs(z5):
    wav = CACHE / 'jvs'; wav.mkdir(parents=True, exist_ok=True); meta = {}
    z = zipfile.ZipFile(ROOT / 'research/jvs_ver1.zip')
    for name in z.namelist():
        p = name.split('/')
        if len(p) == 5 and p[2] in CONFIG and p[4][:-4] in SENTENCES:
            dst = wav / f'{p[1]}-{CONFIG[p[2]]}-{p[4][:-4]}.wav'
            if not dst.exists(): dst.write_bytes(z.read(name))
            meta[dst.stem] = (p[1], CONFIG[p[2]], p[4][:-4])
    V, D = representations(features(sorted(wav.glob('*.wav'))), z5)
    clip = {v: k for k, v in meta.items()}; speakers = sorted({s for s, _, _ in meta.values()})
    out = {'clips': len(meta), 'coverage': {k: len(v) for k, v in V.items()}, 'voice_over_sentence': {}}
    for a, b in [('modal', 'falsetto'), ('modal', 'whisper'), ('falsetto', 'whisper')]:
        for name, vecs in V.items():
            wins = n = 0; ratio = []
            for s in speakers:
                for A, B in ((a, b), (b, a)):
                    for X, Y in itertools.permutations(SENTENCES, 2):
                        q, same, other = clip.get((s, A, X)), clip.get((s, A, Y)), clip.get((s, B, X))
                        if not (q in vecs and same in vecs and other in vecs): continue
                        ds, do = D[name](vecs[q], vecs[same]), D[name](vecs[q], vecs[other])
                        wins += ds < do; n += 1; ratio.append(do / max(ds, 1e-9))
            out['voice_over_sentence'][f'{a}/{b} {name}'] = {'share': wins / n if n else None, 'n': n, 'median_ratio': float(np.median(ratio)) if n else None}
    zs = lambda d: (d - d.mean()) / (d.std() + 1e-12)
    # Among a speaker's other clips, is the nearest in the query's own voice? Only queries that have
    # another clip in their own voice can hit. The blend needs both representations, so its pool is
    # the clips that have both; timbre alone is also scored over every clip it covers.
    out['nearest_same_voice'] = {}
    for label, w, need in [('timbre, all timbre clips', 1.0, ('timbre',)), ('timbre', 1.0, ('timbre', 'five')),
                           ('blend 0.75', 0.75, ('timbre', 'five')), ('blend 0.50', 0.5, ('timbre', 'five')), ('five', 0.0, ('timbre', 'five'))]:
        hits = {}
        for s in speakers:
            ids = [(c, clip.get((s, c, t))) for c in CONFIG.values() for t in SENTENCES]
            ids = [(c, i) for c, i in ids if all(i in V[r] for r in need)]
            for c, q in ids:
                rest = [(c2, i) for c2, i in ids if i != q]
                if not any(c2 == c for c2, _ in rest): continue
                dt = zs(np.array([D['timbre'](V['timbre'][q], V['timbre'][i]) for _, i in rest]))
                d5 = zs(np.array([D['five'](V['five'][q], V['five'][i]) for _, i in rest])) if 'five' in need else 0
                hits.setdefault(c, []).append(rest[int(np.argmin(w * dt + (1 - w) * d5))][0] == c)
        allh = [h for v in hits.values() for h in v]
        out['nearest_same_voice'][label] = {'share': float(np.mean(allh)), 'n': len(allh), **{c: [float(np.mean(v)), len(v)] for c, v in hits.items()}}
    return out


def fetch_vvd():
    tree = json.loads(subprocess.run(['gh', 'api', f'repos/{VVD_REPO}/git/trees/main?recursive=1'], capture_output=True, text=True, check=True).stdout)
    for item in tree['tree']:
        if not item['path'].endswith('.wav'): continue
        dst = VVD / 'audio' / item['path'].split('vvd_files/')[1]
        if dst.exists(): continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(['curl', '-sfL', '-o', str(dst), f'https://raw.githubusercontent.com/{VVD_REPO}/main/{item["path"]}'], check=True)


def vvd(z5):
    clips = CACHE / 'vvd'; clips.mkdir(parents=True, exist_ok=True); meta = {}
    for d in sorted((VVD / 'audio').glob('*/*')):
        out = clips / f'{d.parent.name}-{d.name}.wav'
        if not out.exists():
            parts = []
            for w in ('hit', 'key'):
                x, r = sf.read(d / f'{w}.wav', dtype='float32'); parts += [mono16(x, r).astype('float32'), np.zeros(4800, 'float32')]
            sf.write(out, np.concatenate(parts), 16000)
        meta[out.stem] = (d.parent.name, *(STEP[k] for k in d.name.split('-')))
    V, D = representations(features(sorted(clips.glob('*.wav'))), z5)
    dims = ('pitch', 'resonance', 'weight'); out = {'settings': len(meta), 'speakers': sorted({m[0] for m in meta.values()}), 'spearman': {}, 'per_speaker': {}}
    for name, vecs in V.items():
        pairs = [(a, b) for a, b in itertools.combinations(sorted(vecs), 2) if meta[a][0] == meta[b][0]]
        d = np.array([D[name](vecs[a], vecs[b]) for a, b in pairs]); ranked = np.empty_like(d)
        for s in out['speakers']:  # distances compare within a speaker, so rank them per speaker first
            m = np.array([meta[a][0] == s for a, _ in pairs]); ranked[m] = np.argsort(np.argsort(d[m])) / m.sum()
        out['spearman'][name] = {k: float(spearmanr(ranked, [abs(meta[a][i + 1] - meta[b][i + 1]) for a, b in pairs]).statistic) for i, k in enumerate(dims)}
        out['spearman'][name]['pairs'] = len(pairs)
        for s in out['speakers']:
            sp = [(a, b) for a, b in pairs if meta[a][0] == s]; ds = [D[name](vecs[a], vecs[b]) for a, b in sp]
            out['per_speaker'].setdefault(name, {})[s] = {k: float(spearmanr(ds, [abs(meta[a][i + 1] - meta[b][i + 1]) for a, b in sp]).statistic) for i, k in enumerate(dims)}
    return out


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--fetch-vvd', action='store_true'); args = parser.parse_args()
    if args.fetch_vvd: fetch_vvd()
    _, z5 = load()
    result = {'timbre_version': perception.TIMBRE_VERSION, 'jvs': jvs(z5)}
    if (VVD / 'audio').exists(): result['vvd'] = vvd(z5)
    result['script_sha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (ROOT / 'docs/research/ranking-voice-changes.json').write_text(json.dumps(result, indent=1) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'script_sha256'}, indent=1))


if __name__ == '__main__':
    main()
