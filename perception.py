"""Bounded, on-demand neural descriptors. No gender-classifier output is used."""
import os
from pathlib import Path
import numpy as np

RATE = 16000
VERSION = 'wavlm-sv-int8-v2'
# Second output of the same ONNX graph: the frames of WavLM encoder layer 3, pooled by timbre()
# over speech frames of one centre crop. Cosine distance between two of these ranks reference
# speakers closest to JVS listener similarity ratings (docs/research/jvs-similarity.md); the x-vector remains the
# identity descriptor. The version covers the pooling rule as well as the graph: a different
# crop length, layer or energy threshold changes every vector and must change this string.
TIMBRE_VERSION = 'wavlm-l3-int8-v1'
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


def span(x):
    """Sample range from the first to the last audible 20 ms frame; at least two seconds long."""
    if len(x) < 2 * RATE: raise ValueError('2秒以上の音声を選んでください。')
    step = RATE // 50
    frames = np.pad(x, (0, (-len(x)) % step)).reshape(-1, step)
    rms = np.sqrt(np.mean(frames * frames, axis=1))
    active = np.flatnonzero(rms > max(.001, float(rms.max()) * .02))
    if not len(active): raise ValueError('声が小さすぎます。別の音声を選んでください。')
    start, end = max(0, int(active[0]) * step - step), min(len(x), (int(active[-1]) + 2) * step)
    if end - start < 2 * RATE: raise ValueError('2秒以上、話した音声を選んでください。')
    return start, end


def trimmed(x):
    """Quiet edges removed, internal pauses and the order of speech retained."""
    start, end = span(x)
    return x[start:end]


def windows(x):
    """Raw windows for WavLM; age-model normalization is applied separately."""
    x = trimmed(x)
    width = min(4 * RATE, len(x))
    count = min(3, max(1, int(np.ceil(len(x) / width))))
    starts = np.unique(np.linspace(0, len(x) - width, count, dtype=int))
    result = [x[start:start + width].astype(np.float32)[None, :] for start in starts
              if np.std(x[start:start + width]) >= .001]
    if not result: raise ValueError('声が小さすぎます。別の音声を選んでください。')
    return result


def age_input(part):
    return (part - part.mean()) / np.sqrt(part.var() + 1e-7)


def timbre(x):
    """Layer-3 timbre vector: one pass over at most eight seconds centred on the audible span, with
    the frames pooled over speech only (within 40 dB of the loudest 20 ms frame).

    The quiet edges are kept as context for the model and left out of the mean;
    docs/research/jvs-similarity.md records what each choice was worth on the JVS ratings. Not unit-normalised; compare with cosine distance."""
    start, end = span(x)
    if len(x) > 8 * RATE:
        start = int(np.clip((start + end) // 2 - 4 * RATE, 0, len(x) - 8 * RATE)); x = x[start:start + 8 * RATE]
    if 'timbre_frames' not in [o.name for o in session('wavlm').get_outputs()]:
        raise ValueError('The prepared WavLM model predates the timbre output; run prepare_voice_models.py.')
    frames = session('wavlm').run(['timbre_frames'], {'values': x.astype(np.float32)[None, :]})[0][0]
    # WavLM frames sit on a 320-sample grid; frame energy on that grid selects the speech frames.
    step = RATE // 50; grid = np.pad(x, (0, (-len(x)) % step)).reshape(-1, step)[:len(frames)]
    energy = 10 * np.log10(np.mean(grid * grid, axis=1) + 1e-12); speech = energy > energy.max() - 40
    v = frames[speech].mean(axis=0) if speech.any() else frames.mean(axis=0)
    if v.shape != (768,) or not np.isfinite(v).all(): raise ValueError('この音声の推定に失敗しました。')
    return v


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
