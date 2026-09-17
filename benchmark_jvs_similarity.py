"""Benchmark voice representations against the JVS listener similarity ratings.

JVS ships within-gender speaker similarity matrices (ten listeners per pair,
-3..+3). Stage one caches, for every prepared JVS clip plus the matched-text
whisper/falsetto clips from the archive, the acoustic five, the WavLM-SV
x-vector and mean/std pooled hidden states from each layer of both the
speaker-verification checkpoint and the pretrained WavLM it was tuned from.
Clips are encoded one at a time: WavLM Base+ normalises its first
convolution over the whole time axis, so padding a batch changes every
frame of the shorter clips; the ``checks`` stage measures the effect
(layer-3 mean cosine 0.96 alone against zero-padded to 8 s on the excerpt).
Stage two scores raw distances only: Spearman against the ratings with a
speaker bootstrap (duplicates kept, self-pairs dropped), per-anchor ranking
quality, centroid size, and same-speaker sensitivity to whisper/falsetto
against different-sentence and different-speaker distances. No supervision
touches the ratings here.

Needs the embedding environment (.venv-embedding, CUDA), research/jvs_ver1.zip,
data/native-ja.json with data/samples, and .models/wavlm-base-plus-sv from
prepare_voice_models.py. The prepared clips' acoustic five are the values the
library was built with (the Rust engine); the archive clips are measured here
with acoustics.py.
"""
from pathlib import Path
import argparse, io, json, math, re, time, zipfile
import acoustics
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from scipy.stats import rankdata

ROOT = Path(__file__).parent
ZIP = ROOT / 'research/jvs_ver1.zip'
OUT = ROOT / 'research/jvs-benchmark-v2'
SV = ROOT / '.models/wavlm-base-plus-sv'
PRETRAINED = ('microsoft/wavlm-base-plus', '4c66d4806a428f2e922ccfa1a962776e232d487b')
KEYS = ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']
MATCHED = [f'VOICEACTRESS100_{i:03d}' for i in range(1, 6)]
RATE = 16000


def sv_revision():
    """The pinned wavlm-base-plus-sv revision, read from prepare_voice_models.py without importing torch."""
    return re.search(r"WAVLM_REV = '([0-9a-f]+)'", (ROOT / 'prepare_voice_models.py').read_text()).group(1)


def pcm16(data, rate):
    x = data.mean(axis=1) if data.ndim > 1 else data
    if rate != RATE:
        d = math.gcd(rate, RATE); x = resample_poly(x, RATE // d, rate // d)
    return x.astype('float32')


def clip_table():
    """Every clip to encode: prepared parallel/nonpara, plus archive modal, whisper and falsetto for the matched sentences."""
    rows = []
    for c in json.loads((ROOT / 'data/native-ja.json').read_text())['clips']:
        if c.get('dataset') != 'JVS': continue
        speaker, subset, sentence = c['id'].split('-', 2)
        rows.append({'id': c['id'], 'speaker': speaker, 'subset': subset, 'sentence': sentence, 'style': 'modal',
                     'path': str(ROOT / 'data/samples' / Path(c['audio']).name), 'features': {k: c['features'].get(k) for k in KEYS}})
    with zipfile.ZipFile(ZIP) as z:
        for name in z.namelist():
            m = re.fullmatch(r'jvs_ver1/(jvs\d{3})/(parallel100|whisper10|falset10)/wav24kHz16bit/(VOICEACTRESS100_00[1-5])\.wav', name)
            if not m: continue
            speaker, subset, sentence = m.groups()
            style = {'parallel100': 'modal', 'whisper10': 'whisper', 'falset10': 'falsetto'}[subset]
            rows.append({'id': f'{speaker}-{subset}-{sentence}-archive', 'speaker': speaker, 'subset': subset, 'sentence': sentence,
                         'style': style, 'path': f'zip:{name}', 'features': None})
    return rows


def load(row, z):
    if row['path'].startswith('zip:'):
        data, rate = sf.read(io.BytesIO(z.read(row['path'][4:])), dtype='float32')
    else:
        data, rate = sf.read(row['path'], dtype='float32')
    return pcm16(data, rate)


def model_checks(sv, base):
    """Facts the report relies on, measured rather than asserted: the two checkpoints' encoder weights
    match key by key; the x-vector head's softmax layer weights; and how much zero-padding a clip to
    eight seconds inside a batch moves its pooled layers (WavLM Base+ group-normalises its first
    convolution over the whole time axis)."""
    import torch
    base_sd = base.state_dict()
    weight_gap = max(float((a - base_sd[n]).abs().max()) for n, a in sv.wavlm.state_dict().items() if n in base_sd)
    x, r = sf.read(ROOT / 'data/original-excerpt.wav', dtype='float32'); x = pcm16(x, r)[:5 * RATE]
    padded = np.zeros(8 * RATE, 'float32'); padded[:len(x)] = x
    with torch.inference_mode():
        alone = sv(input_values=torch.from_numpy(x[None, :]).cuda(), output_hidden_states=True)
        mask = torch.zeros(1, 8 * RATE, dtype=torch.long); mask[0, :len(x)] = 1
        batched = sv(input_values=torch.from_numpy(padded[None, :]).cuda(), attention_mask=mask.cuda(), output_hidden_states=True)
    frames = alone.hidden_states[3].shape[1]
    cos = lambda a, b: float(torch.nn.functional.cosine_similarity(a, b, dim=0))
    padding = {f'layer{l}_mean': cos(alone.hidden_states[l][0].mean(0), batched.hidden_states[l][0, :frames].mean(0)) for l in [3, 12]}
    padding['xvector'] = cos(alone.embeddings[0], batched.embeddings[0])
    return {'encoder_weight_max_abs_diff': weight_gap, 'xvector_layer_weights': torch.softmax(sv.layer_weights.detach(), 0).tolist(),
            'padding_to_8s_cosine_alone_vs_padded': padding, 'padding_check_clip': 'data/original-excerpt.wav, first 5 s'}


def checks():
    """Re-measure the model checks and store them next to the cached clips."""
    import torch
    from transformers import WavLMForXVector, WavLMModel
    sv = WavLMForXVector.from_pretrained(SV, use_safetensors=True).eval().cuda(); base = WavLMModel.from_pretrained(PRETRAINED[0], revision=PRETRAINED[1]).eval().cuda()
    meta = json.loads((OUT / 'clips.json').read_text()); meta['checks'] = model_checks(sv, base)
    (OUT / 'clips.json').write_text(json.dumps(meta, ensure_ascii=False)); print(json.dumps(meta['checks'], indent=1))


def extract():
    import torch
    from transformers import WavLMForXVector, WavLMModel
    from acoustics import measure
    assert torch.cuda.is_available(), 'CUDA is required for the encoder batch'
    torch.set_num_threads(4)
    rows = clip_table(); OUT.mkdir(parents=True, exist_ok=True)
    print(len(rows), 'clips', flush=True)
    sv = WavLMForXVector.from_pretrained(SV, use_safetensors=True).eval().cuda()
    base = WavLMModel.from_pretrained(PRETRAINED[0], revision=PRETRAINED[1]).eval().cuda()
    checks = model_checks(sv, base)
    layers = sv.config.num_hidden_layers + 1
    n = len(rows)
    store = {'xvector': np.zeros((n, 512), 'float32'),
             'sv_mean': np.zeros((n, layers, 768), 'float16'), 'sv_std': np.zeros((n, layers, 768), 'float16'),
             'base_mean': np.zeros((n, layers, 768), 'float16'), 'base_std': np.zeros((n, layers, 768), 'float16')}
    acoustic = np.full((n, len(KEYS)), np.nan, 'float32'); reason = [None] * n; voiced = np.zeros(n, 'float32')
    start = time.monotonic()
    with zipfile.ZipFile(ZIP) as z:
        for offset in range(0, n, 8):
            batch = rows[offset:offset + 8]; audio = [load(r, z) for r in batch]
            for i, (r, x) in enumerate(zip(batch, audio)):
                if r['features'] is None:
                    m = measure(x, RATE); r['features'] = {k: m['features'].get(k) for k in KEYS}; reason[offset + i] = m['reason']; voiced[offset + i] = m['voiced_seconds']
                acoustic[offset + i] = [np.nan if r['features'][k] is None else r['features'][k] for k in KEYS]
            for i, x in enumerate(audio):
                # Centre crop to eight seconds; one clip per forward pass, no padding (see the module docstring).
                if len(x) > 128000: x = x[(len(x) - 128000) // 2:(len(x) - 128000) // 2 + 128000]
                values = torch.from_numpy(x[None, :]).cuda()
                with torch.inference_mode(), torch.autocast('cuda', dtype=torch.float16):
                    out_sv = sv(input_values=values, output_hidden_states=True)
                    out_base = base(input_values=values, output_hidden_states=True)
                store['xvector'][offset + i] = torch.nn.functional.normalize(out_sv.embeddings.float(), dim=-1)[0].cpu().numpy()
                for prefix, out in [('sv', out_sv), ('base', out_base)]:
                    hs = torch.stack(out.hidden_states, 0)[:, 0].float()  # layer, frame, dim
                    store[f'{prefix}_mean'][offset + i] = hs.mean(1).cpu().numpy(); store[f'{prefix}_std'][offset + i] = hs.std(1).cpu().numpy()
            if offset % 400 == 0: print(offset + len(batch), '/', n, round(time.monotonic() - start), 's', flush=True)
    meta = [{k: r[k] for k in ['id', 'speaker', 'subset', 'sentence', 'style']} for r in rows]
    for i, r in enumerate(meta): r['reason'] = reason[i]; r['voiced_seconds'] = float(voiced[i])
    np.savez(OUT / 'cache.npz', acoustic=acoustic, **store)
    library = json.loads((ROOT / 'data/native-ja.json').read_text())
    (OUT / 'clips.json').write_text(json.dumps({'pretrained': PRETRAINED, 'sv_revision': sv_revision(), 'acoustics_version': acoustics.VERSION,
                                                'library_engine_version': library.get('version'), 'padding': 'none, one clip per pass, centre crop <= 8 s, fp16 autocast',
                                                'checks': checks, 'clips': meta}, ensure_ascii=False))
    print('cached', n, 'clips in', round(time.monotonic() - start), 's; peak', round(torch.cuda.max_memory_allocated() / 1024 ** 2), 'MB', flush=True)


def ratings():
    """Return {group: (speakers, matrix)} after validating shape, diagonal and symmetry."""
    out = {}
    with zipfile.ZipFile(ZIP) as z:
        for group in ['female', 'male']:
            lines = [l.split(',') for l in z.read(f'jvs_ver1/speaker_similarity_{group}.csv').decode().strip().splitlines()]
            ids = [l[0] for l in lines]; m = np.array([[float(v) for v in l[1:]] for l in lines])
            assert m.shape == (len(ids), len(ids)), (group, m.shape)
            assert np.allclose(np.diag(m), 3), 'self-similarity is not the scale maximum'
            asym = float(np.abs(m - m.T).max())
            out[group] = {'speakers': ids, 'matrix': (m + m.T) / 2, 'max_asymmetry': asym}
    return out


def standardize(features, reference):
    """Semitone pitch, then the robust scaling of the app's map (web/space.js AcousticSpace), fitted on the modal clips."""
    x = features.copy(); x[:, 0] = 12 * np.log2(x[:, 0]); r = reference.copy(); r[:, 0] = 12 * np.log2(r[:, 0])
    scale = np.maximum((np.nanquantile(r, .75, axis=0) - np.nanquantile(r, .25, axis=0)) / 1.349, [1, 30, 2, 2, 1])
    return (x - np.nanmedian(r, axis=0)) / scale


def distances(vectors, metric):
    if metric == 'cosine':
        v = vectors / np.linalg.norm(vectors, axis=-1, keepdims=True); return np.maximum(0, 1 - v @ v.T)
    return np.linalg.norm(vectors[:, None, :] - vectors[None, :, :], axis=-1)


def spearman(a, b):
    if np.isnan(a).any() or np.isnan(b).any(): return float('nan')
    return float(np.corrcoef(rankdata(a), rankdata(b))[0, 1])


def bootstrap_pairs(idx):
    """Unique position pairs of a speaker resample whose originals differ: duplicates stay, self-pairs go."""
    a, b = np.triu_indices(len(idx), 1); keep = idx[a] != idx[b]
    return a[keep], b[keep]


def score(dist, matrix, rng, boots=500):
    """Global Spearman over unique pairs, per-anchor Spearman, and a 95% speaker-bootstrap interval."""
    n = len(matrix); iu = np.triu_indices(n, 1)
    glob = spearman(matrix[iu], -dist[iu])
    anchors = np.array([spearman(np.delete(matrix[i], i), -np.delete(dist[i], i)) for i in range(n)])
    samples = []
    for _ in range(boots):
        idx = rng.choice(n, n, replace=True); a, b = bootstrap_pairs(idx)
        samples.append(spearman(matrix[idx[a], idx[b]], -dist[idx[a], idx[b]]))
    ci = [float(np.nanpercentile(samples, 2.5)), float(np.nanpercentile(samples, 97.5))] if boots else None
    return {'spearman': glob, 'ci95': ci,
            'anchor_median': float(np.nanmedian(anchors)), 'anchor_p10': float(np.nanpercentile(anchors, 10)), 'anchor_min': float(np.nanmin(anchors))}


def evaluate(seed=0):
    rng = np.random.default_rng(seed)
    cache = np.load(OUT / 'cache.npz'); meta = json.loads((OUT / 'clips.json').read_text()); clips = meta['clips']
    rated = ratings()
    speaker = np.array([c['speaker'] for c in clips]); subset = np.array([c['subset'] for c in clips]); style = np.array([c['style'] for c in clips])
    sentence = np.array([c['sentence'] for c in clips]); archive = np.array([c['id'].endswith('-archive') for c in clips])
    modal = (style == 'modal') & ~archive
    acoustic = standardize(cache['acoustic'], cache['acoustic'][modal])
    reps = {'acoustic_five': (acoustic, 'euclid'), 'xvector': (cache['xvector'], 'cosine')}
    layers = cache['sv_mean'].shape[1]
    for prefix in ['sv', 'base']:
        for l in range(layers):
            reps[f'{prefix}_L{l:02d}_mean'] = (cache[f'{prefix}_mean'][:, l].astype('float32'), 'cosine')
            reps[f'{prefix}_L{l:02d}_meanstd'] = (np.concatenate([cache[f'{prefix}_mean'][:, l], cache[f'{prefix}_std'][:, l]], -1).astype('float32'), 'cosine')
    result = {'ratings': {g: {'speakers': len(v['speakers']), 'max_asymmetry': v['max_asymmetry']} for g, v in rated.items()},
              **{k: meta[k] for k in ['pretrained', 'sv_revision', 'acoustics_version', 'library_engine_version', 'padding', 'checks'] if k in meta},
              'conditions': {}, 'sensitivity': {}, 'coverage': {}}

    def centroid(vectors, mask_fn, ids, k=None, draws=1):
        outs = []
        for _ in range(draws):
            rows = []
            for s in ids:
                idx = np.flatnonzero(mask_fn(s))
                if k is not None: idx = rng.choice(idx, min(k, len(idx)), replace=False)
                rows.append(np.nanmean(vectors[idx], axis=0))
            outs.append(np.array(rows))
        return outs

    conditions = {'parallel20': (lambda s: (speaker == s) & (subset == 'parallel100') & modal, None, 1),
                  'parallel5': (lambda s: (speaker == s) & (subset == 'parallel100') & modal, 5, 5),
                  'parallel1': (lambda s: (speaker == s) & (subset == 'parallel100') & modal, 1, 10),
                  'nonpara30': (lambda s: (speaker == s) & (subset == 'nonpara30') & modal, None, 1),
                  'nonpara1': (lambda s: (speaker == s) & (subset == 'nonpara30') & modal, 1, 10)}
    for name, (vectors, metric) in reps.items():
        for cond, (mask_fn, k, draws) in conditions.items():
            for group, r in rated.items():
                scores = [score(distances(c, metric), r['matrix'], rng, boots=0 if draws > 1 else 500) for c in centroid(vectors, mask_fn, r['speakers'], k, draws)]
                agg = {key: float(np.nanmean([s[key] for s in scores])) for key in ['spearman', 'anchor_median', 'anchor_p10', 'anchor_min']}
                agg['ci95'] = scores[0]['ci95'] if draws == 1 else None
                result['conditions'].setdefault(cond, {}).setdefault(group, {})[name] = agg

    # Same-speaker sensitivity on the matched sentences: modal vs whisper / falsetto of the same text,
    # against modal different-text (same speaker) and modal same-text different-speaker (same gender).
    gender = {s: g for g, r in rated.items() for s in r['speakers']}
    idx = {(c['speaker'], c['style'], c['sentence']): i for i, c in enumerate(clips) if archive[i]}
    for name, (vectors, metric) in reps.items():
        d = distances(vectors[archive], metric); local = {i: j for j, i in enumerate(np.flatnonzero(archive))}
        def dist(a, b): return d[local[idx[a]], local[idx[b]]]
        rows = {'whisper': [], 'falsetto': [], 'other_text': [], 'other_speaker': []}
        for (s, st, sent), _ in idx.items():
            if st != 'modal': continue
            for alt in ['whisper', 'falsetto']:
                if (s, alt, sent) in idx: rows[alt].append(dist((s, 'modal', sent), (s, alt, sent)))
            for other in MATCHED:
                if other != sent and (s, 'modal', other) in idx: rows['other_text'].append(dist((s, 'modal', sent), (s, 'modal', other)))
            for t in gender:
                if t != s and gender[t] == gender.get(s) and (t, 'modal', sent) in idx: rows['other_speaker'].append(dist((s, 'modal', sent), (t, 'modal', sent)))
        med = {k: float(np.nanmedian(v)) for k, v in rows.items()}
        result['sensitivity'][name] = {**med, 'whisper_over_text': med['whisper'] / med['other_text'], 'falsetto_over_text': med['falsetto'] / med['other_text'],
                                       'whisper_over_speaker': med['whisper'] / med['other_speaker'], 'falsetto_over_speaker': med['falsetto'] / med['other_speaker']}
    for st in ['modal', 'whisper', 'falsetto']:
        m = archive & (style == st); feats = cache['acoustic'][m]; reported = [i for i in np.flatnonzero(m) if clips[i]['reason'] is None]
        result['coverage'][st] = {'clips': int(m.sum()), 'all_five_present': float(np.mean(np.isfinite(feats).all(1))),
                                  'withheld': int(m.sum()) - len(reported),
                                  'median_voiced_seconds_of_reported': float(np.median([clips[i]['voiced_seconds'] for i in reported])) if reported else None,
                                  'median_f0_of_reported': float(np.nanmedian(feats[:, 0]))}
    (OUT / 'result.json').write_text(json.dumps(result, indent=1))
    return result


def report(result):
    print('ratings:', result['ratings'])
    for cond in result['conditions']:
        print(f'\n== {cond}  (spearman [ci95] anchor-median anchor-p10)')
        names = list(result['conditions'][cond]['female'])
        best = sorted(names, key=lambda n: -np.mean([result['conditions'][cond][g][n]['spearman'] for g in ['female', 'male']]))
        for n in dict.fromkeys([x for x in best if not x.startswith(('sv_L', 'base_L'))] + best[:8]):
            line = f'{n:20s}'
            for g in ['female', 'male']:
                s = result['conditions'][cond][g][n]; ci = f"[{s['ci95'][0]:+.2f},{s['ci95'][1]:+.2f}]" if s['ci95'] else '[   -   ]'
                line += f"  {g[0]} {s['spearman']:+.3f} {ci} {s['anchor_median']:+.2f} {s['anchor_p10']:+.2f}"
            print(line)
    print('\n== sensitivity (median distance ratios; whisper/falsetto vs same-speaker other text, vs other same-gender speaker same text)')
    for n, s in result['sensitivity'].items():
        if n.startswith(('sv_L', 'base_L')) and not n.endswith(('L00_mean', 'L06_mean', 'L12_mean', 'L03_mean', 'L09_mean')): continue
        print(f"{n:20s} whisper/text {s['whisper_over_text']:5.2f} falsetto/text {s['falsetto_over_text']:5.2f}  whisper/speaker {s['whisper_over_speaker']:5.2f} falsetto/speaker {s['falsetto_over_speaker']:5.2f}")
    print('\n== extractor coverage on archive matched sentences'); print(json.dumps(result['coverage'], indent=1))


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('stage', choices=['extract', 'checks', 'evaluate', 'all']); a = p.parse_args()
    if a.stage in ('extract', 'all'): extract()
    if a.stage == 'checks': checks()
    if a.stage in ('evaluate', 'all'): report(evaluate())
