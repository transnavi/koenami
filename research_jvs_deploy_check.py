"""Score the deployed timbre pipeline and its alternatives on the JVS listener similarity ratings.

Every row is computed from audio on disk, so each number in the deployment table
of docs/research/jvs-similarity.md has this script as its producer:

- ``xvector``: the prepared int8 graph, output ``embedding``, three trimmed 4 s windows (perception.windows).
- ``timbre_windows``: layer-3 frames from the same three windows, mean over all frames.
- ``timbre_trimmed_crop``: quiet edges trimmed, one centre crop of at most 8 s, mean over all frames.
- ``timbre_raw_crop``: untrimmed centre crop of at most 8 s, mean over all frames.
- ``timbre_raw_crop_speech``: the same crop, mean over frames within 40 dB of the loudest.
- ``timbre_deployed``: perception.timbre as shipped.
- ``fp32_*``: the raw-crop variants through the fp32 checkpoint, for the quantization comparison.

Each variant is scored on centroids of the twenty parallel sentences (Spearman
with a speaker bootstrap) and as single non-parallel clips ranked against the
other speakers' centroids (median over speakers of the mean over the speaker's
first five non-parallel clips);
the deployed variant also gets a paired bootstrap difference to the x-vector.
Runs in the embedding environment with KOENAMI_CUDA=1; the ONNX session needs
``onnxruntime.preload_dlls`` before perception is imported.
"""
from pathlib import Path
import argparse, json, time
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import onnxruntime as ort
ort.preload_dlls(directory='')
import benchmark_jvs_similarity as bench
import perception

ROOT = bench.ROOT; OUT = bench.OUT


def crop8(x): return x[(len(x) - 128000) // 2:(len(x) - 128000) // 2 + 128000] if len(x) > 128000 else x


def speech_mask(x, frames):
    step = 320; grid = np.pad(x, (0, (-len(x)) % step)).reshape(-1, step)[:frames]
    energy = 10 * np.log10(np.mean(grid * grid, axis=1) + 1e-12); return energy > energy.max() - 40


def vectors(rows, fp32):
    session = perception.session('wavlm'); names = ['xvector', 'timbre_windows', 'timbre_trimmed_crop', 'timbre_raw_crop', 'timbre_raw_crop_speech', 'timbre_deployed']
    if fp32:
        import torch; from transformers import WavLMForXVector
        model = WavLMForXVector.from_pretrained(bench.SV, use_safetensors=True).eval().cuda(); names += ['fp32_raw_crop', 'fp32_raw_crop_speech', 'fp32_trimmed_crop']
        def layer3(x):
            with torch.inference_mode(): return model(torch.from_numpy(x[None, :]).cuda(), output_hidden_states=True).hidden_states[3][0].float().cpu().numpy()
    V = {n: np.full((len(rows), 512 if n == 'xvector' else 768), np.nan, 'float32') for n in names}; start = time.monotonic()
    for i, c in enumerate(rows):
        x, r = sf.read(ROOT / 'data/samples' / (c['id'] + '.flac'), dtype='float32')
        if r != 16000: x = resample_poly(x, 16000, r).astype('float32')
        try: parts = perception.windows(x); trimmed = perception.trimmed(x)
        except ValueError: continue
        outs = [session.run(None, {'values': p}) for p in parts]
        V['xvector'][i] = np.mean([o[0][0] for o in outs], 0); V['timbre_windows'][i] = np.mean([o[1][0].mean(0) for o in outs], 0)
        V['timbre_trimmed_crop'][i] = session.run(['timbre_frames'], {'values': crop8(trimmed)[None, :]})[0][0].mean(0)
        raw = crop8(x); frames = session.run(['timbre_frames'], {'values': raw[None, :]})[0][0]
        V['timbre_raw_crop'][i] = frames.mean(0); m = speech_mask(raw, len(frames)); V['timbre_raw_crop_speech'][i] = frames[m].mean(0) if m.any() else frames.mean(0)
        try: V['timbre_deployed'][i] = perception.timbre(x)
        except ValueError: pass
        if fp32:
            h = layer3(raw); V['fp32_raw_crop'][i] = h.mean(0); m = speech_mask(raw, len(h)); V['fp32_raw_crop_speech'][i] = h[m].mean(0) if m.any() else h.mean(0)
            V['fp32_trimmed_crop'][i] = layer3(crop8(trimmed)).mean(0)
        if i % 1000 == 0: print(i, round(time.monotonic() - start), 's', flush=True)
    return V


def main(fp32, boots):
    clips = json.loads((OUT / 'clips.json').read_text())['clips']
    # Every parallel clip (the centroids) and the first five non-parallel clips per speaker (the queries): the
    # single-clip metric draws five per speaker, so encoding the other twenty-five would change nothing.
    seen = {}; rows = []
    for c in clips:
        if c['id'].endswith('-archive'): continue
        if c['subset'] == 'nonpara30':
            seen[c['speaker']] = seen.get(c['speaker'], 0) + 1
            if seen[c['speaker']] > 5: continue
        rows.append(c)
    V = vectors(rows, fp32); np.savez(OUT / 'deploy-vectors.npz', ids=[c['id'] for c in rows], **V)
    speaker = np.array([c['speaker'] for c in rows]); subset = np.array([c['subset'] for c in rows]); rng = np.random.default_rng(0); rated = bench.ratings()
    ok = {n: np.isfinite(V[n]).all(1) for n in V}
    result = {'clips': len(rows), 'clips_ok': {n: int(ok[n].sum()) for n in V}, 'timbre_version': perception.TIMBRE_VERSION, 'xvector_version': perception.VERSION,
              'sv_revision': bench.sv_revision(), 'variants': {}, 'paired_delta_vs_xvector': {}}
    cents = {}
    for n in V:
        result['variants'][n] = {}
        for g, r in rated.items():
            keep = ok[n] & ok['xvector']
            cents[(n, g)] = np.array([V[n][(speaker == s) & (subset == 'parallel100') & keep].mean(0) for s in r['speakers']])
            result['variants'][n][f'parallel20/{g}'] = bench.score(bench.distances(cents[(n, g)], 'cosine'), r['matrix'], rng, boots=boots)
            per = []
            for qi, s in enumerate(r['speakers']):
                idx = np.flatnonzero((speaker == s) & (subset == 'nonpara30') & keep); vals = []
                for j in rng.choice(idx, min(5, len(idx)), replace=False):
                    d = bench.distances(np.vstack([V[n][j][None, :], cents[(n, g)]]), 'cosine')[0, 1:]; vals.append(bench.spearman(np.delete(r['matrix'][qi], qi), -np.delete(d, qi)))
                per.append(np.nanmean(vals) if vals else np.nan)
            result['variants'][n][f'nonpara1_query/{g}'] = {'median': float(np.nanmedian(per)), 'p10': float(np.nanpercentile(per, 10))}
    for g, r in rated.items():
        M = r['matrix']; Dt = bench.distances(cents[('timbre_deployed', g)], 'cosine'); Dx = bench.distances(cents[('xvector', g)], 'cosine'); deltas = []
        for _ in range(boots):
            idx = rng.choice(len(M), len(M), replace=True); a, b = bench.bootstrap_pairs(idx); truth = M[idx[a], idx[b]]
            deltas.append(bench.spearman(truth, -Dt[idx[a], idx[b]]) - bench.spearman(truth, -Dx[idx[a], idx[b]]))
        result['paired_delta_vs_xvector'][g] = {'mean': float(np.mean(deltas)), 'ci95': [float(np.percentile(deltas, 2.5)), float(np.percentile(deltas, 97.5))]}
    (OUT / 'deploy-check.json').write_text(json.dumps(result, indent=1))
    for n, v in result['variants'].items():
        print(f"{n:24s} centroid f/m {v['parallel20/female']['spearman']:+.3f} {v['parallel20/male']['spearman']:+.3f}   single f/m {v['nonpara1_query/female']['median']:+.3f} {v['nonpara1_query/male']['median']:+.3f}")
    print('paired delta vs xvector', result['paired_delta_vs_xvector'])


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('--fp32', action='store_true', help='also run the fp32 checkpoint variants'); p.add_argument('--boots', type=int, default=1000)
    a = p.parse_args(); main(a.fp32, a.boots)
