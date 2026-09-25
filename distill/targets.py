"""Teacher targets for distilling the timbre descriptor.

For every clip: the exact crop perception.timbre feeds the model (at most 8 s, chosen the same
way), the shipped layer-3 graph's frames on that crop (fp16), and the speech mask the pooling
uses. Speakers held out for evaluation never enter the training set.

    python targets.py split              writes split.json
    python targets.py run K N            shard K of N -> shard-K.{npy,json}
"""
import json, os, sys, zipfile, io
from pathlib import Path
import numpy as np, soundfile as sf
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'research/distill'  # working files: targets, audio crops, checkpoints (gitignored)
DATA = ROOT / 'data'
JVS = ROOT / 'research/jvs_ver1.zip'
sys.path.insert(0, str(ROOT))
RATE, STEP = 16000, 320


def crop_and_mask(x):
    """perception.timbre without the model: the input crop and a function from frame count to mask."""
    import perception
    start, end = perception.span(x)
    n = 8 * 50
    rms = perception.frame_rms(x)
    if len(x) > 8 * RATE:
        counts = np.cumsum(np.r_[0, perception.audible(rms)]); counts = counts[n:] - counts[:-n]
        best = np.flatnonzero(counts == counts.max()); centre = ((start + end) // 2 - 4 * RATE) // STEP
        c = min(int(best[np.abs(best - centre).argmin()]) * STEP, len(x) - 8 * RATE)
        x = x[c:c + 8 * RATE]; rms = perception.frame_rms(x)
    def mask(frames):
        energy = 20 * np.log10(rms[:frames] + 1e-12)
        return (energy > energy.max() - 40) & (rms[:frames] > perception.FLOOR)
    return x, mask


def split():
    rng = np.random.default_rng(0)
    lib = json.load(open(DATA / 'native-ja.json'))['clips']
    genders = {l.split()[0]: l.split()[1] for l in zipfile.ZipFile(JVS).read('jvs_ver1/gender_f0range.txt').decode().splitlines()[1:] if l.strip()}
    held_jvs = sorted(rng.permutation(sorted(s for s, g in genders.items() if g == 'F'))[:20].tolist() +
                      rng.permutation(sorted(s for s, g in genders.items() if g == 'M'))[:20].tolist())
    cv = sorted({c['speaker'] for c in lib if c.get('dataset') == 'Common Voice'})
    held_cv = sorted(rng.permutation(cv)[:round(0.3 * len(cv))].tolist())
    held = set(held_jvs) | set(held_cv)
    items = []
    for name in zipfile.ZipFile(JVS).namelist():
        p = name.split('/')
        if len(p) == 5 and p[4].endswith('.wav') and p[1] not in held:
            items.append({'id': f'{p[1]}-{p[2]}-{p[4][:-4]}', 'speaker': p[1], 'zip': name})
    for lang in ('ja', 'zh-CN', 'en', 'ko'):
        path = DATA / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json')
        for c in json.load(open(path))['clips']:
            if c.get('dataset') == 'JVS' or c['speaker'] in held or c.get('synthetic'): continue
            items.append({'id': c['id'], 'speaker': c['speaker'], 'file': str(DATA / 'samples' / Path(c['audio']).name)})
    json.dump({'held_jvs': held_jvs, 'held_cv': held_cv, 'train': items}, open(OUT / 'split.json', 'w'))
    print(len(items), 'training clips from', len({i['speaker'] for i in items}), 'speakers; held out', len(held_jvs), 'JVS and', len(held_cv), 'Common Voice speakers')


def run(k, n):
    os.chdir(ROOT)
    import perception
    from acoustics import mono16
    items = json.load(open(OUT / 'split.json'))['train'][k::n]
    z = zipfile.ZipFile(JVS); session = perception.session('timbre')
    frames_out, meta, total = [], [], 0
    for i, it in enumerate(items):
        try:
            x, r = sf.read(io.BytesIO(z.read(it['zip'])) if 'zip' in it else it['file'], dtype='float32')
            x = mono16(x if x.ndim == 1 else x.mean(1), r).astype('float32')
            x, mask = crop_and_mask(x)
        except Exception: continue
        f = session.run(['timbre_frames'], {'values': x[None, :]})[0][0]
        m = mask(len(f))
        if m.sum() < 75: continue
        np.save(OUT / 'audio' / f"{it['id']}.npy", x.astype(np.float16))
        frames_out.append(f.astype(np.float16)); meta.append({'id': it['id'], 'speaker': it['speaker'], 'offset': total, 'frames': len(f), 'mask': np.packbits(m).tolist()})
        total += len(f)
        if i % 500 == 0: print(k, i, '/', len(items), flush=True)
    np.save(OUT / f'shard-{k}.npy', np.concatenate(frames_out)); json.dump(meta, open(OUT / f'shard-{k}.json', 'w'))
    print(k, 'done', len(meta), 'clips', total, 'frames', flush=True)


if __name__ == '__main__':
    (OUT / 'audio').mkdir(parents=True, exist_ok=True)
    split() if sys.argv[1] == 'split' else run(int(sys.argv[2]), int(sys.argv[3]))
