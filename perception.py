"""Bounded, on-demand neural descriptors. No gender-classifier output is used."""
import os
from pathlib import Path
import numpy as np

RATE = 16000
VERSION = 'wavlm-sv-int8-v2'
MODEL_DIR = Path(os.environ.get('KOENAMI_MODELS', Path(__file__).parent / '.models/perception'))
_sessions = {}


def available():
    return all((MODEL_DIR / f'{name}.int8.onnx').is_file() for name in ['wavlm', 'age'])


def session(name):
    if name not in _sessions:
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        # CUDA can be selected for local inference; public containers have CPUs.
        providers = ['CPUExecutionProvider']
        if os.environ.get('KOENAMI_CUDA') == '1' and 'CUDAExecutionProvider' in ort.get_available_providers():
            providers.insert(0, 'CUDAExecutionProvider')
        _sessions[name] = ort.InferenceSession(str(MODEL_DIR / f'{name}.int8.onnx'),
                                             sess_options=options, providers=providers)
    return _sessions[name]


def windows(x):
    """Raw windows for WavLM; age-model normalization is applied separately."""
    if len(x) < 2 * RATE: raise ValueError('2秒以上の音声を選んでください。')
    # Trim only quiet edges, retaining internal pauses and the order of speech.
    step = RATE // 50
    frames = np.pad(x, (0, (-len(x)) % step)).reshape(-1, step)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    active = np.flatnonzero(rms > max(.001, float(rms.max()) * .02))
    if not len(active): raise ValueError('声が小さすぎます。別の音声を選んでください。')
    x = x[max(0, int(active[0]) * step - step):min(len(x), (int(active[-1]) + 2) * step)]
    if len(x) < 2 * RATE: raise ValueError('2秒以上、話した音声を選んでください。')
    width = min(4 * RATE, len(x))
    count = min(3, max(1, int(np.ceil(len(x) / width))))
    starts = np.unique(np.linspace(0, len(x) - width, count, dtype=int))
    result = [x[start:start + width].astype(np.float32)[None, :] for start in starts
              if np.std(x[start:start + width]) >= .001]
    if not result: raise ValueError('声が小さすぎます。別の音声を選んでください。')
    return result


def age_input(part):
    return (part - part.mean()) / np.sqrt(part.var() + 1e-7)


def describe(x):
    parts = windows(x)
    embeddings, ages = [], []
    for part in parts:
        embeddings.append(session('wavlm').run(None, {'values': part})[0][0])
    for part in parts:
        ages.append(float(session('age').run(None, {'values': age_input(part)})[0].ravel()[0]))
    embedding = np.mean(embeddings, axis=0)
    embedding /= max(float(np.linalg.norm(embedding)), 1e-8)
    if not np.isfinite(embedding).all() or not np.isfinite(ages).all():
        raise ValueError('この音声の推定に失敗しました。')
    return {'version': VERSION, 'embedding': embedding.round(7).tolist(),
            'age': {'estimate': round(float(np.median(ages)), 1),
                    'windowRange': [round(min(ages), 1), round(max(ages), 1)],
                    'windows': len(ages), 'model': 'audeering-6-layer',
                    'target': 'speaker-age', 'validatedJapanesePerception': False}}
