"""Speech-presence screen for the Japanese reference library.

Two independent checks per clip, both cached by audio checksum:

- Silero VAD (MIT, pinned below) gives the seconds of detected speech.
- Whisper transcribes the clip and the reading form of the result is compared
  with the Common Voice prompt. On silence or noise Whisper produces nothing or
  one of a few stock phrases, which is a reliable signature of an empty clip.

A clip is rejected when both agree that no usable speech is present. Quiet but
intelligible readings are kept; recordings that Silero missed but Whisper read
correctly are kept too. The screen does not judge accent, speaker, or quality.

Runs in the app environment (.venv) with the same CUDA libraries as the server.
Stale cache entries are dropped, so the file lists exactly the screened clips.
"""
import argparse
import difflib
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import onnxruntime as ort

ROOT = Path(__file__).parent
REVISION = '41f03a954b841327835dea1ddb7bb28ae23ddc2c'
SCREEN = 'vad+whisper-v1'
# Stock phrases Whisper emits on silence or noise, as reading forms.
HALLUCINATIONS = ('ごしちょう', 'ありがとうございました', 'おやすみなさい', 'おつかれさまでした', 'ちゃんねるとうろく', 'みてくれてありがとう', 'じかいよこく', 'おんがく')

_tokenizer = None


def reading(text):
    """Hiragana reading with punctuation removed, so kanji and kana spellings compare equal."""
    global _tokenizer
    if _tokenizer is None:
        from sudachipy import dictionary, tokenizer
        _tokenizer = (dictionary.Dictionary(dict='core').create(), tokenizer.Tokenizer.SplitMode.C)
    tok, mode = _tokenizer
    parts = [(m.reading_form() or m.surface()) for m in tok.tokenize(unicodedata.normalize('NFKC', text), mode)]
    joined = ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in ''.join(parts))
    return re.sub(r'[^ぁ-ゖa-z0-9]', '', joined.lower())


def verdict(speech, level, transcript, prompt):
    """Return the rejection reason, or None when the clip holds usable speech."""
    heard, expected = reading(transcript), reading(prompt)
    similarity = difflib.SequenceMatcher(None, expected, heard).ratio() if heard and expected else 0.0
    stock = any(p in heard for p in HALLUCINATIONS) and similarity < .5
    reason = None
    if speech < 1 and (not heard or stock):
        reason = 'Whisper heard nothing' if not heard else 'Whisper stock phrase'
    elif speech < .5 and level < -45 and similarity < .3:
        reason = 'Faint, unintelligible'
    elif speech < .16 and similarity < .3:
        reason = 'No detected speech, unintelligible'
    return round(similarity, 3), reason


def load(file):
    x, sr = sf.read(file, dtype='float32')
    if x.ndim > 1: x = x.mean(axis=1)
    if sr != 16000: x = resample_poly(x, 16000, sr).astype(np.float32)
    peak = float(np.max(np.abs(x))) if len(x) else 0
    level = 20 * np.log10(max(float(np.sqrt(np.mean(x ** 2))), 1e-8)) if len(x) else -160
    return x, peak, round(float(level), 1)


def vad_session(cpu):
    folder = ROOT / '.models/vad'; folder.mkdir(parents=True, exist_ok=True)
    if not (folder / 'model.onnx').exists():
        base = f'https://raw.githubusercontent.com/snakers4/silero-vad/{REVISION}/'
        for name, dest in [('src/silero_vad/data/silero_vad.onnx', 'model.onnx'), ('LICENSE', 'LICENSE')]:
            (folder / dest).write_bytes(urlopen(base + name, timeout=60).read())
    providers = ['CPUExecutionProvider']
    if not cpu and 'CUDAExecutionProvider' in ort.get_available_providers():
        providers.insert(0, 'CUDAExecutionProvider')
    opts = ort.SessionOptions(); opts.intra_op_num_threads = 1; opts.inter_op_num_threads = 1
    return ort.InferenceSession(str(folder / 'model.onnx'), providers=providers, sess_options=opts)


def vad(session, arrays):
    """Seconds of speech and peak probability for each 16 kHz array, batched."""
    arrays = [x * min(16, .2 / max(float(np.max(np.abs(x))), 1e-8)) if len(x) and np.max(np.abs(x)) < .2 else x for x in arrays]
    length = max(len(x) for x in arrays); size = len(arrays)
    states = np.zeros((2, size, 128), dtype=np.float32); context = np.zeros((size, 64), dtype=np.float32)
    probabilities = [[] for _ in arrays]
    for offset in range(0, length, 512):
        chunk = np.zeros((size, 512), dtype=np.float32)
        for i, x in enumerate(arrays):
            part = x[offset:offset + 512]; chunk[i, :len(part)] = part
        outputs, states = session.run(None, {'input': np.concatenate([context, chunk], axis=1), 'state': states, 'sr': np.array(16000, dtype=np.int64)})
        context = chunk[:, -64:]
        for i, x in enumerate(arrays):
            if offset < len(x): probabilities[i].append(float(outputs[i, 0]))
    return [(round(sum(p >= .5 for p in prob) * .032, 3), round(max(prob, default=0), 4)) for prob in probabilities]


def whisper(cpu):
    from faster_whisper import WhisperModel
    path = ROOT / '.models/turbo'
    return WhisperModel(str(path) if (path / 'model.bin').exists() else 'turbo', device='cpu' if cpu else 'cuda',
                        compute_type='int8' if cpu else 'float16', download_root=str(ROOT / '.models'), cpu_threads=4)


def main(cpu=False):
    policy = json.loads((ROOT / 'curation/common-voice-ja.json').read_text())
    from build_common_voice_ja import metadata, selection
    # Every clip the selection rules admit, including ones an earlier screen dropped.
    rows = sorted((r for r in metadata() if selection(r)), key=lambda r: r['file_name'])
    library = [{'id': Path(r['file_name']).stem, 'text': r['text']} for r in rows]
    prompts = {c['id']: c['text'] for c in library}
    # Reviewed empty clips stay in the run as controls even though the build excludes them.
    texts = {Path(r.get('file_name', '')).stem: r.get('text', '') for r in metadata()}
    for row in policy.get('clip_reviews', []):
        if row['clip'] not in prompts:
            library.append({'id': row['clip'], 'text': texts.get(row['clip'], '')}); prompts[row['clip']] = texts.get(row['clip'], '')
    path = ROOT / 'data/speech-quality.json'; cache = json.loads(path.read_text()) if path.exists() else {}
    pending = []
    for clip in library:
        file = ROOT / 'data/samples' / (clip['id'] + '.mp3'); digest = hashlib.sha256(file.read_bytes()).hexdigest()
        saved = cache.get(clip['id'])
        if saved and saved.get('sha256') == digest and saved.get('revision') == REVISION and saved.get('screen') == SCREEN: continue
        pending.append((clip, file, digest))
    if pending:
        session = vad_session(cpu); model = whisper(cpu)
    for start in range(0, len(pending), 32):
        group = pending[start:start + 32]; loaded = [load(file) for _, file, _ in group]
        speech = vad(session, [x for x, _, _ in loaded])
        for (clip, file, digest), (x, peak, level), (seconds, probability) in zip(group, loaded, speech):
            segments, _ = model.transcribe(x, language='ja', beam_size=3, vad_filter=False, condition_on_previous_text=False)
            transcript = ''.join(s.text for s in segments).strip()
            cache[clip['id']] = {'sha256': digest, 'revision': REVISION, 'screen': SCREEN, 'speechSeconds': seconds, 'peakProbability': probability,
                                 'levelDbfs': level, 'transcript': transcript}
        path.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')))
        print('Speech screened:', min(start + 32, len(pending)), '/', len(pending), flush=True)
    # Model outputs are cached; the verdict is derived on every run so rule changes need no re-transcription.
    cache = {c['id']: cache[c['id']] for c in library}
    for clip in library:
        entry = cache[clip['id']]
        entry['similarity'], entry['reason'] = verdict(entry['speechSeconds'], entry['levelDbfs'], entry['transcript'], prompts[clip['id']])
        entry['empty'] = entry['reason'] is not None
    path.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')))
    rejected = [c['id'] for c in library if cache[c['id']]['empty']]
    print(json.dumps({'screened': len(library), 'empty': rejected, 'count': len(rejected)}), flush=True)


if __name__ == '__main__':
    libs = list((Path(sys.prefix) / 'lib').glob('python*/site-packages/nvidia/*/lib'))
    if libs and not os.environ.get('VOICE_CUDA_READY'):
        env = {**os.environ, 'VOICE_CUDA_READY': '1', 'LD_LIBRARY_PATH': ':'.join(map(str, libs)) + ':' + os.environ.get('LD_LIBRARY_PATH', '')}
        os.execve(sys.executable, [sys.executable, *sys.argv], env)
    p = argparse.ArgumentParser(); p.add_argument('--cpu', action='store_true'); main(p.parse_args().cpu)
