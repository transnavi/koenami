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
TIMBRE_VERSION = 'wavlm-l3-int8-v2'
MODEL_DIR = Path(os.environ.get('KOENAMI_MODELS', Path(__file__).parent / '.models/perception'))
_sessions = {}


def available(names=('wavlm', 'age')):
    return all((MODEL_DIR / f'{name}.int8.onnx').is_file() for name in names)


def timbre_ready():
    """The prepared WavLM graph is present and carries the timbre output; opening the session warms it."""
    return available(['wavlm']) and 'timbre_frames' in [o.name for o in session('wavlm').get_outputs()]


def session(name):
    if name not in _sessions:
        import onnxruntime as ort
        options = ort.SessionOptions()
        options.intra_op_num_threads = int(os.environ.get('KOENAMI_ORT_THREADS', 2))  # the public box keeps two; offline builds may lift it
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        # CUDA can be selected for local inference; public containers have CPUs.
        providers = ['CPUExecutionProvider']
        if os.environ.get('KOENAMI_CUDA') == '1' and 'CUDAExecutionProvider' in ort.get_available_providers():
            providers.insert(0, 'CUDAExecutionProvider')
        _sessions[name] = ort.InferenceSession(str(MODEL_DIR / f'{name}.int8.onnx'),
                                             sess_options=options, providers=providers)
    return _sessions[name]


FLOOR = .001  # rms of a 20 ms frame below which nothing counts as audible, in span() and in the pooling


def frame_rms(x):
    """Root-mean-square per 20 ms frame on WavLM's 320-sample grid."""
    step = RATE // 50
    frames = np.pad(x, (0, (-len(x)) % step)).reshape(-1, step)
    return np.sqrt(np.mean(frames * frames, axis=1))


def audible(rms):
    """Frames that locate speech within a whole recording: above the floor and within 2% of the loudest frame."""
    return rms > max(FLOOR, float(rms.max()) * .02)


def span(x):
    """Sample range from the first to the last audible 20 ms frame; at least two seconds long."""
    if len(x) < 2 * RATE: raise ValueError('too_short')
    step = RATE // 50
    active = np.flatnonzero(audible(frame_rms(x)))
    if not len(active): raise ValueError('too_quiet')
    start, end = max(0, int(active[0]) * step - step), min(len(x), (int(active[-1]) + 2) * step)
    if end - start < 2 * RATE: raise ValueError('too_little_speech')
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
    if not result: raise ValueError('too_quiet')
    return result


def age_input(part):
    return (part - part.mean()) / np.sqrt(part.var() + 1e-7)


def timbre(x):
    """Layer-3 timbre vector: one pass over the eight seconds holding the most audible frames (ties
    toward the centre of the audible span), pooled over speech frames only: within 40 dB of the
    crop's loudest 20 ms frame and above the level floor.

    The quiet edges are kept as context for the model and left out of the mean;
    docs/research/jvs-similarity.md records what each choice was worth on the JVS ratings. Not unit-normalised; compare with cosine distance."""
    start, end = span(x)
    step, n = RATE // 50, 8 * 50
    rms = frame_rms(x)
    if len(x) > 8 * RATE:
        counts = np.cumsum(np.r_[0, audible(rms)]); counts = counts[n:] - counts[:-n]
        best = np.flatnonzero(counts == counts.max()); centre = ((start + end) // 2 - 4 * RATE) // step
        c = min(int(best[np.abs(best - centre).argmin()]) * step, len(x) - 8 * RATE)
        x = x[c:c + 8 * RATE]; rms = frame_rms(x)
    if not timbre_ready(): raise ValueError('The prepared WavLM model predates the timbre output; run prepare_voice_models.py.')
    frames = session('wavlm').run(['timbre_frames'], {'values': x.astype(np.float32)[None, :]})[0][0]
    energy = 20 * np.log10(rms[:len(frames)] + 1e-12)
    speech = (energy > energy.max() - 40) & (rms[:len(frames)] > FLOOR)
    if speech.sum() < 75: raise ValueError('too_little_speech')  # 1.5 s of speech frames
    v = frames[speech].mean(axis=0)
    if v.shape != (768,) or not np.isfinite(v).all(): raise ValueError('failed')
    return v


def age(x):
    """Rough listener-facing age in years: the median over at most three four-second windows.
    The model returns years directly; the range across windows is reported so a spread can be
    read as instability rather than precision."""
    parts = windows(x)
    ages = [float(session('age').run(None, {'values': age_input(part)})[0].ravel()[0]) for part in parts]
    if not np.isfinite(ages).all(): raise ValueError('failed')
    return {'estimate': round(float(np.median(ages)), 1), 'windowRange': [round(min(ages), 1), round(max(ages), 1)],
            'windows': len(ages), 'model': 'audeering-6-layer', 'target': 'speaker-age', 'validatedJapanesePerception': False}


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
        raise ValueError('failed')
    return {'version': VERSION, 'embedding': embedding.round(7).tolist(),
            'age': {'estimate': round(float(np.median(ages)), 1),
                    'windowRange': [round(min(ages), 1), round(max(ages), 1)],
                    'windows': len(ages), 'model': 'audeering-6-layer',
                    'target': 'speaker-age', 'validatedJapanesePerception': False}}
