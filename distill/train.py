"""Distil the layer-3 timbre frames into the student.

Loss per batch: frame L1 on teacher-standardised frames, frame cosine, cosine between the
speech-pooled descriptors (what the ranking uses), and the gap between the student's and the
teacher's pairwise cosine matrices of those descriptors across the batch (the relations the
ranking depends on). 2 % of clips are held back to watch the loss; real evaluation is eval.py.

    python train.py [--steps 30000] [--batch 32] [--tag base]
"""
import argparse, glob, json, math, random, time
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from student import Student

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'research/distill'  # working files: targets, audio crops, checkpoints (gitignored)
p = argparse.ArgumentParser()
p.add_argument('--steps', type=int, default=30000); p.add_argument('--batch', type=int, default=32)
p.add_argument('--lr', type=float, default=1e-3); p.add_argument('--tag', default='base')
p.add_argument('--w_pool', type=float, default=10.0); p.add_argument('--w_rel', type=float, default=100.0)
p.add_argument('--seed', type=int, default=0)
args = p.parse_args()
torch.manual_seed(args.seed); random.seed(args.seed); np.random.seed(args.seed)

clips = []
for f in sorted(glob.glob(str(OUT / 'shard-*.json'))):
    frames = np.load(f.replace('.json', '.npy'), mmap_mode='r')
    for m in json.load(open(f)):
        t = m['frames']
        # Targets and audio stay memory-mapped: read per batch from the page cache, never copied
        # into the process (all of them together are about 9 GB).
        clips.append({'id': m['id'], 'speaker': m['speaker'], 'target': frames[m['offset']:m['offset'] + t],
                      'mask': np.unpackbits(np.array(m['mask'], np.uint8))[:t].astype(bool),
                      'wave': np.load(OUT / 'audio' / f"{m['id']}.npy", mmap_mode='r')})
print(len(clips), 'clips', sum(len(c['target']) for c in clips), 'frames', flush=True)
random.shuffle(clips); n_val = max(64, len(clips) // 50)
val, train = clips[:n_val], clips[n_val:]
sample = np.concatenate([c['target'] for c in random.sample(train, 400)]).astype(np.float32)
mu, sd = torch.tensor(sample.mean(0)).cuda(), torch.tensor(sample.std(0) + 1e-3).cuda()
train.sort(key=lambda c: len(c['wave']))


def batches(pool, size):
    """Batches of similar lengths, in random order."""
    groups = [pool[i:i + size] for i in range(0, len(pool), size)]
    random.shuffle(groups); return groups


def collate(group):
    n = max(len(c['wave']) for c in group); t = (n - 400) // 320 + 1
    wave = torch.zeros(len(group), n); target = torch.zeros(len(group), t, 768)
    valid = torch.zeros(len(group), t, dtype=torch.bool); speech = torch.zeros(len(group), t, dtype=torch.bool)
    lengths = torch.tensor([len(c['wave']) for c in group])
    for i, c in enumerate(group):
        k = len(c['target']); wave[i, :len(c['wave'])] = torch.from_numpy(c['wave'].astype(np.float32))
        target[i, :k] = torch.from_numpy(c['target'].astype(np.float32)); valid[i, :k] = True; speech[i, :k] = torch.from_numpy(c['mask'])
    return wave.cuda(), target.cuda(), valid.cuda(), speech.cuda(), lengths.cuda()


def losses(model, wave, target, valid, speech, lengths):
    out = model(wave, pad=~valid, lengths=lengths).float()
    v = valid[..., None]
    l1 = ((out - target).abs() / sd * v).sum() / (v.sum() * 768)
    fcos = 1 - (F.cosine_similarity(out, target, dim=-1) * valid).sum() / valid.sum()
    s = speech[..., None].float()
    ps, pt = (out * s).sum(1) / s.sum(1), (target * s).sum(1) / s.sum(1)
    pcos = 1 - F.cosine_similarity(ps, pt, dim=-1).mean()
    ns, nt = F.normalize(ps, dim=-1), F.normalize(pt, dim=-1)
    rel = F.mse_loss(ns @ ns.T, nt @ nt.T)
    return l1 + fcos + args.w_pool * pcos + args.w_rel * rel, dict(l1=l1.item(), fcos=fcos.item(), pcos=pcos.item(), rel=rel.item())


model = Student().cuda()
opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
warm = 1000
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / args.steps))))
step, t0, best = 0, time.time(), float('inf')
resume = OUT / f'resume-{args.tag}.pt'
if resume.exists():
    state = torch.load(resume)
    model.load_state_dict(state['model']); opt.load_state_dict(state['opt']); sched.load_state_dict(state['sched'])
    step, best = state['step'], state['best']; random.setstate(state['random'])
    print('resumed at step', step, flush=True)
log = open(OUT / f'train-{args.tag}.log', 'a')
while step < args.steps:
    for group in batches(train, args.batch):
        model.train()
        with torch.autocast('cuda', dtype=torch.bfloat16):
            loss, parts = losses(model, *collate(group))
        opt.zero_grad(set_to_none=True); loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0); opt.step(); sched.step(); step += 1
        if step % 500 == 0 or step == args.steps:
            model.eval(); vals = []
            with torch.no_grad(), torch.autocast('cuda', dtype=torch.bfloat16):
                for g in [val[i:i + args.batch] for i in range(0, len(val), args.batch)]:
                    vals.append(losses(model, *collate(g))[1])
            v = {k: float(np.mean([x[k] for x in vals])) for k in vals[0]}
            line = f"step {step} train {loss.item():.4f} val l1 {v['l1']:.4f} fcos {v['fcos']:.4f} pcos {v['pcos']:.5f} rel {v['rel']:.6f} {time.time() - t0:.0f}s"
            print(line, flush=True); log.write(line + '\n'); log.flush()
            score = v['pcos'] + v['rel'] * 10
            if score < best: best = score; torch.save(model.state_dict(), OUT / f'student-{args.tag}.pt')
            torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'sched': sched.state_dict(),
                        'step': step, 'best': best, 'random': random.getstate()}, resume.with_suffix('.tmp'))
            resume.with_suffix('.tmp').replace(resume)
        if step >= args.steps: break
print('best', best)
