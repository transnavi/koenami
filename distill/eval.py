"""Teacher against student on speakers the student never saw, through the same crop and pooling.

- listener agreement: each held-out JVS speaker's non-parallel clips rank the other held-out
  speakers of the same group (centroids of their library clips) against the JVS ratings;
- retrieval: over held-out JVS and Common Voice speakers with at least four clips, one clip out,
  the speaker's remaining clips must beat every other held-out speaker;
- voice changes: held-out JVS speakers' modal / falsetto / whisper readings of five sentences,
  same voice on another sentence closer than the same sentence in another voice;
- Versatile Voice Dataset (never trained on): Spearman of distance with pitch / resonance /
  weight steps within each speaker;
- agreement of the student's descriptors with the teacher's (cosine).

    python eval.py student-base.pt            (runs the student in torch on the GPU)
    python eval.py model.onnx                 (runs an exported student with onnxruntime, CPU)
"""
import io, itertools, json, os, sys, zipfile
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.stats import spearmanr
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'research/distill'  # working files: targets, audio crops, checkpoints (gitignored)
RESEARCH = ROOT / 'research'
sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(Path(__file__).parent))
from targets import crop_and_mask
os.chdir(ROOT)
import perception
from acoustics import mono16

split = json.load(open(OUT / 'split.json'))
held_jvs, held_cv = set(split['held_jvs']), set(split['held_cv'])
lib = json.load(open('data/native-ja.json'))['clips']
rng = np.random.default_rng(1)


def load(path):
    x, r = sf.read(path, dtype='float32'); return mono16(x if x.ndim == 1 else x.mean(1), r).astype('float32')


class Teacher:
    def __init__(self): self.s = perception.session('timbre')
    def frames(self, x): return self.s.run(['timbre_frames'], {'values': x[None, :]})[0][0]


class TorchStudent:
    def __init__(self, path):
        import torch
        from student import Student
        self.torch = torch; self.m = Student().cuda().eval(); self.m.load_state_dict(torch.load(path))
    def frames(self, x):
        with self.torch.no_grad(): return self.m(self.torch.from_numpy(x)[None].cuda())[0].float().cpu().numpy()


class OnnxStudent:
    def __init__(self, path):
        import onnxruntime as ort
        o = ort.SessionOptions(); o.intra_op_num_threads = 2
        self.s = ort.InferenceSession(str(path), sess_options=o, providers=['CPUExecutionProvider'])
    def frames(self, x): return self.s.run(None, {'values': x[None, :]})[0][0]


def descriptor(model, x):
    """perception.timbre with the model swapped in."""
    x, mask = crop_and_mask(x)
    f = model.frames(x); m = mask(len(f))
    if m.sum() < 75: raise ValueError('too_little_speech')
    return f[m].mean(0)


def unit(v): return v / np.linalg.norm(v)


def vectors(model, paths):
    out = {}
    for k, p in paths.items():
        try: out[k] = descriptor(model, load(p))
        except ValueError: pass
    return out


def main():
    path = Path(sys.argv[1]) if Path(sys.argv[1]).is_absolute() else OUT / sys.argv[1]
    student = OnnxStudent(path) if path.suffix == '.onnx' else TorchStudent(path)
    teacher = Teacher()
    clips = {c['id']: c for c in lib if c.get('plotted') and not c.get('synthetic') and c['speaker'] in held_jvs | held_cv}
    paths = {i: f"data/samples/{Path(c['audio']).name}" for i, c in clips.items()}
    z = zipfile.ZipFile(RESEARCH / 'jvs_ver1.zip')
    vc = {p.stem: str(p) for p in (RESEARCH / 'voice-changes/jvs').glob('*.wav') if p.stem.split('-')[0] in held_jvs}
    vvd = {p.stem: str(p) for p in (RESEARCH / 'voice-changes/vvd').glob('*.wav')}
    result = {}
    for name, model in (('teacher', teacher), ('student', student)):
        V = vectors(model, {**paths, **vc, **vvd})
        by = {}
        for i in paths:
            if i in V: by.setdefault(clips[i]['speaker'], []).append(i)
        r = {}
        # listener agreement among held-out JVS speakers
        agree = []
        for g in ('female', 'male'):
            lines = z.read(f'jvs_ver1/speaker_similarity_{g}.csv').decode().split()
            names = [l.split(',')[0] for l in lines]; M = np.array([[float(x) for x in l.split(',')[1:]] for l in lines])
            keep = [i for i, s in enumerate(names) if s in held_jvs and s in by]
            cent = {names[i]: unit(np.mean([V[c] for c in by[names[i]]], 0)) for i in keep}
            for i in keep:
                qs = [c for c in by[names[i]] if 'nonpara30' in c]
                rows = [j for j in keep if j != i]; sim = M[i, rows]
                vals = [spearmanr(-np.array([1 - cent[names[j]] @ unit(V[q]) for j in rows]), sim).statistic for q in qs[:5]]
                if vals: agree.append(np.mean(vals))
        agree = np.array(agree)
        r['agreement'] = float(agree.mean()); r['agreement_by_speaker'] = agree.tolist()
        # retrieval among held-out speakers
        cand = [s for s, c in by.items() if len(c) >= 4]; hits = []
        for s in cand:
            for q in np.random.default_rng(int.from_bytes(s.encode()[:8].ljust(8, b'0'), 'little')).permutation(sorted(by[s]))[:8]:
                d = {t: 1 - unit(np.mean([V[c] for c in by[t] if c != q], 0)) @ unit(V[q]) for t in cand}
                hits.append(min(d, key=d.get) == s)
        r['retrieval'] = float(np.mean(hits)); r['retrieval_n'] = len(hits); r['retrieval_speakers'] = len(cand); r['retrieval_hits'] = [bool(h) for h in hits]
        # voice changes, held-out JVS speakers
        key = {tuple(k.split('-')[:3]): k for k in vc if k in V}
        wins = n = 0
        for (s, a, x) in list(key):
            for b in ('modal', 'falsetto', 'whisper'):
                if b == a: continue
                for y in {t for (s2, a2, t) in key if s2 == s and a2 == a and t != x}:
                    same, other = key.get((s, a, y)), key.get((s, b, x))
                    if same and other:
                        q = unit(V[key[(s, a, x)]]); wins += (1 - q @ unit(V[same])) < (1 - q @ unit(V[other])); n += 1
        r['voice_over_sentence'] = wins / n if n else None; r['voice_n'] = n
        # Versatile Voice Dataset
        step = {'low': 0, 'med': 1, 'high': 2}; vv = [k for k in vvd if k in V]
        pairs = [(a, b) for a, b in itertools.combinations(vv, 2) if a.split('-')[0] == b.split('-')[0]]
        D = np.array([1 - unit(V[a]) @ unit(V[b]) for a, b in pairs]); ranked = np.empty_like(D)
        for sp in {a.split('-')[0] for a, _ in pairs}:
            m = np.array([a.split('-')[0] == sp for a, _ in pairs]); ranked[m] = np.argsort(np.argsort(D[m])) / m.sum()
        r['vvd'] = {dim: float(spearmanr(ranked, [abs(step[a.split('-')[i + 1]] - step[b.split('-')[i + 1]]) for a, b in pairs]).statistic)
                    for i, dim in enumerate(('pitch', 'resonance', 'weight'))}
        result[name] = r; result[name + '_vectors'] = V
    T, S = result.pop('teacher_vectors'), result.pop('student_vectors')
    common = [k for k in T if k in S]
    cos = np.array([unit(T[k]) @ unit(S[k]) for k in common])
    result['student_vs_teacher_cosine'] = {'median': float(np.median(cos)), 'p5': float(np.percentile(cos, 5)), 'min': float(cos.min()), 'n': len(common)}
    diff = np.array(result['student']['agreement_by_speaker']) - np.array(result['teacher']['agreement_by_speaker'])
    draws = [diff[rng.integers(0, len(diff), len(diff))].mean() for _ in range(2000)]
    result['agreement_diff'] = {'mean': float(diff.mean()), 'ci95': [float(v) for v in np.percentile(draws, [2.5, 97.5])]}
    th, sh = result['teacher'].pop('retrieval_hits'), result['student'].pop('retrieval_hits')
    result['retrieval_paired'] = {'queries': len(th), 'teacher_only': sum(a and not b for a, b in zip(th, sh)),
                                  'student_only': sum(b and not a for a, b in zip(th, sh))}
    for k in ('teacher', 'student'): result[k].pop('agreement_by_speaker')
    json.dump(result, open(OUT / f'eval-{path.stem}.json', 'w'), indent=1)
    print(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
