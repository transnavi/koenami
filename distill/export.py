"""Export a student to ONNX with the teacher's interface (input `values`, output `timbre_frames`,
dynamic length), store its learned weights as per-output-channel int8 with the arithmetic left in
fp32 (the fixed DFT and mel matrices stay fp32), and install it as the model perception.timbre runs.

    python distill/export.py student-base.pt
        writes research/distill/student-base.onnx and .w8.onnx, and
        .models/perception/timbre-student.int8.onnx with timbre-student-card.json beside it
"""
import hashlib, json, sys
from pathlib import Path
import numpy as np, onnx, torch
from onnx import numpy_helper, helper
from student import Student

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'research/distill'
MODELS = ROOT / '.models/perception'
ckpt = OUT / sys.argv[1]; stem = ckpt.stem
model = Student().eval(); model.load_state_dict(torch.load(ckpt, map_location='cpu'))


class Export(torch.nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, values): return self.m(values)


full = OUT / f'{stem}.onnx'
torch.onnx.export(Export(model), (torch.zeros(1, 64000),), str(full), input_names=['values'], output_names=['timbre_frames'],
                  dynamic_axes={'values': {1: 'samples'}, 'timbre_frames': {1: 'frames'}}, opset_version=17, dynamo=False)

m = onnx.load(full); g = m.graph
inits = {t.name: t for t in g.initializer}
fixed = set()
for n in g.node:  # the DFT and mel convolutions read constant buffers; keep them exact
    if n.op_type == 'Conv' and n.input[1] in inits and numpy_helper.to_array(inits[n.input[1]]).shape[0] in (201, 80):
        fixed.add(n.input[1])
axis_of = {}
for n in g.node:
    w = n.input[1] if len(n.input) > 1 else None
    if w in inits and w not in fixed:
        a = numpy_helper.to_array(inits[w])
        if a.ndim >= 2 and a.size >= 4096:
            axis_of[w] = 0 if n.op_type == 'Conv' or (n.op_type == 'Gemm' and any(x.name == 'transB' and x.i for x in n.attribute)) else a.ndim - 1
deq = []
for name, axis in axis_of.items():
    w = numpy_helper.to_array(inits[name]).astype(np.float32)
    red = tuple(i for i in range(w.ndim) if i != axis)
    scale = np.abs(w).max(axis=red) / 127.0; scale[scale == 0] = 1
    shape = [1] * w.ndim; shape[axis] = -1
    q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
    g.initializer.remove(inits[name])
    g.initializer.extend([numpy_helper.from_array(q, name + '_q'), numpy_helper.from_array(scale.astype(np.float32), name + '_scale')])
    deq.append(helper.make_node('DequantizeLinear', [name + '_q', name + '_scale'], [name], axis=axis))
for n in reversed(deq): g.node.insert(0, n)
onnx.checker.check_model(m)
out = OUT / f'{stem}.w8.onnx'; onnx.save(m, out)
print(f'{full.name} {full.stat().st_size / 1e6:.2f} MB, {out.name} {out.stat().st_size / 1e6:.2f} MB, {len(axis_of)} weights in int8')

target = MODELS / 'timbre-student.int8.onnx'; partial = target.with_suffix('.partial')
partial.write_bytes(out.read_bytes()); partial.replace(target)
split = json.loads((OUT / 'split.json').read_text())
shards = [json.loads(f.read_text()) for f in sorted(OUT.glob('shard-*.json'))]
card = {
    'name': 'timbre-student', 'file': target.name, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'teacher': 'timbre.int8.onnx: microsoft/wavlm-base-plus-sv, encoder layer 3 frames (MIT)',
    'architecture': 'log-mel (fixed DFT and mel convolutions), 4 Conformer blocks d=192, projection to 768; one frame per 20 ms',
    'parameters': sum(p.numel() for p in model.parameters()), 'weights': 'learned weights int8 per output channel, fp32 arithmetic',
    'training_clips': sum(len(s) for s in shards), 'training_speakers': len({c['speaker'] for s in shards for c in s}),
    'held_out_speakers': {'jvs': len(split['held_jvs']), 'common_voice': len(split['held_cv'])},
    'training_audio': 'JVS (research/jvs_ver1.zip, every style of the non-held speakers) and the served Common Voice libraries; no listener ratings',
    'terms': 'Trained on JVS audio, which its terms allow for academic research, non-commercial research and personal use only, with redistribution restricted; '
             'the weights carry those limits and are not MIT-licensed. The WavLM teacher (microsoft/wavlm-base-plus-sv) is MIT; Common Voice is CC0.',
}
(MODELS / 'timbre-student-card.json').write_text(json.dumps(card, indent=1) + '\n')
print('installed', target, round(target.stat().st_size / 1e6, 2), 'MB')
