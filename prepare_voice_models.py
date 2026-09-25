"""Prepare optional CPU inference models; weights retain their upstream licenses.

Run in a venv with torch, transformers, huggingface_hub, onnx and onnxruntime.
The deployment consumes the generated .models/perception directory, not this venv.
"""
from pathlib import Path
import gc
import json
import urllib.request
import torch
from torch import nn
from transformers import WavLMForXVector, Wav2Vec2Model, Wav2Vec2PreTrainedModel
from huggingface_hub import snapshot_download
from onnx.utils import extract_model
from onnxruntime.quantization import quantize_dynamic, QuantType

ROOT = Path(__file__).parent
OUT = ROOT / '.models/perception'
WAVLM_REV = '1bfd64eca136543feb28c5ffaf05381c6af33121'
AGE_REV = 'a681b720dafd12b9dd7b6d13fb437c7b6b197fd3'


class AgeHead(nn.Module):
    def __init__(self, config, outputs):
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.out_proj = nn.Linear(config.hidden_size, outputs)

    def forward(self, x):
        return self.out_proj(torch.tanh(self.dense(x)))


class AgeModel(Wav2Vec2PreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.wav2vec2 = Wav2Vec2Model(config)
        self.age = AgeHead(config, 1)
        # Load all checkpoint keys, but never export the demographic classifier.
        self.gender = AgeHead(config, 3)

    def forward(self, values):
        return self.age(self.wav2vec2(values).last_hidden_state.mean(dim=1)) * 100


TIMBRE_LAYER = 3
SPECS = {'wavlm': dict(outputs=['embedding', 'timbre_frames'], timbre_layer=TIMBRE_LAYER), 'age': dict(outputs=['age'])}


class VoiceEncoder(nn.Module):
    """Speaker-verification x-vector plus the frames of encoder layer TIMBRE_LAYER, which
    `perception.timbre` pools over speech frames. The JVS listener-similarity benchmark
    (docs/research/jvs-similarity.md) found layers 2–3 order speakers closest to listener ratings, and
    that the pooling must skip silent frames while the model still sees them as context; the
    x-vector head is unchanged."""
    def __init__(self, path):
        super().__init__()
        self.model = WavLMForXVector.from_pretrained(path).eval()

    def forward(self, values):
        out = self.model(values, output_hidden_states=True)
        return nn.functional.normalize(out.embeddings, dim=-1), out.hidden_states[TIMBRE_LAYER]


def main():
    torch.set_num_threads(2)
    OUT.mkdir(parents=True, exist_ok=True)
    items = [
        ('wavlm', 'microsoft/wavlm-base-plus-sv', WAVLM_REV, 'MIT'),
        ('age', 'audeering/wav2vec2-large-robust-6-ft-age-gender', AGE_REV, 'CC-BY-NC-SA-4.0'),
    ]
    manifest = OUT / 'manifest.json'
    prepared = {item['name']: item for item in json.loads(manifest.read_text())} if manifest.exists() else {}
    for name, repo, revision, license_id in items:
        target = OUT / (name + '.int8.onnx')
        source = ROOT / '.models' / ('wavlm-base-plus-sv' if name == 'wavlm' else 'age')
        snapshot_download(repo, revision=revision, local_dir=source,
                          allow_patterns=['config.json', 'model.safetensors', 'README.md', 'LICENSE', 'preprocessor_config.json'])
        settings = json.loads((source / 'preprocessor_config.json').read_text())
        assert settings['sampling_rate'] == 16000 and settings['do_normalize'] == (name == 'age')
        entry = dict(name=name, source='https://huggingface.co/' + repo, revision=revision, license=license_id, **SPECS[name])
        if not target.exists() or prepared.get(name) != entry:
            model = VoiceEncoder(source) if name == 'wavlm' else AgeModel.from_pretrained(source)
            model.eval()
            full = OUT / (name + '.onnx')
            torch.onnx.export(model, (torch.zeros(1, 64000),), str(full),
                              input_names=['values'], output_names=SPECS[name]['outputs'],
                              dynamic_axes={'values': {1: 'samples'}, **{o: {1: 'frames'} for o in SPECS[name]['outputs'] if o.endswith('_frames')}},
                              opset_version=17, dynamo=False)
            del model
            gc.collect()
            quantize_dynamic(str(full), str(target), weight_type=QuantType.QInt8,
                             op_types_to_quantize=['MatMul', 'Gemm'])
            full.unlink()
        for filename in ['LICENSE', 'README.md', 'preprocessor_config.json']:
            if (source / filename).exists():
                (OUT / (name + '-' + filename)).write_bytes((source / filename).read_bytes())
        print(name, 'prepared', round(target.stat().st_size / 1e6), 'MB', flush=True)
    # The timbre descriptor reads layer 3 alone. Its graph is the prepared WavLM graph cut at that
    # output: the convolutional frontend and the first three encoder layers, the same weights and
    # operators, so it returns the same frames without layers 4-12 and the x-vector head.
    timbre, wavlm = OUT / 'timbre.int8.onnx', OUT / 'wavlm.int8.onnx'
    if not timbre.exists() or timbre.stat().st_mtime < wavlm.stat().st_mtime:
        # Written beside the target and moved into place, so an interrupted run leaves no truncated
        # graph that looks newer than its source.
        partial = timbre.with_suffix('.partial')
        extract_model(str(wavlm), str(partial), input_names=['values'], output_names=['timbre_frames'], check_model=True)
        partial.replace(timbre)
    print('timbre prepared', round(timbre.stat().st_size / 1e6), 'MB', flush=True)
    license_path = OUT / 'wavlm-LICENSE'
    if not license_path.exists():
        with urllib.request.urlopen('https://raw.githubusercontent.com/microsoft/unilm/0e31c7c09737df491e7ff74ded19614b884c52b4/LICENSE', timeout=30) as response:
            license_path.write_bytes(response.read())
    (OUT / 'manifest.json').write_text(json.dumps([
        dict(name=n, source='https://huggingface.co/' + r, revision=v, license=l, **SPECS[n])
        for n, r, v, l in items] + [
        dict(name='timbre', source='https://huggingface.co/microsoft/wavlm-base-plus-sv', revision=WAVLM_REV, license='MIT',
             outputs=['timbre_frames'], timbre_layer=TIMBRE_LAYER, extracted_from='wavlm.int8.onnx')], indent=2))


if __name__ == '__main__':
    main()
