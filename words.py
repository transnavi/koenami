"""Local GPU transcription with estimated word boundaries."""
import hashlib
import json
import threading
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parent
_model = None
_tokenizer = None
_lock = threading.Lock()
LANGUAGES = {'ja': 'ja', 'zh-CN': 'zh', 'en': 'en', 'ko': 'ko'}


def transcribe(x, language, hint=None):
    global _model, _tokenizer
    if language not in LANGUAGES:
        raise ValueError('Unsupported transcription language.')
    x = np.asarray(x, dtype=np.float32)
    key = hashlib.sha256(x.tobytes() + language.encode() + b'turbo-words-v2' + (hint or '').encode()).hexdigest()
    path = ROOT / 'data/words' / (key + '.json')
    with _lock:
        if path.exists():
            return json.loads(path.read_text())
        from faster_whisper import WhisperModel
        if _model is None:
            _model = WhisperModel(str(ROOT / '.models/turbo') if (ROOT / '.models/turbo/model.bin').exists() else 'turbo', device='cuda', compute_type='float16',
                                  download_root=str(ROOT / '.models'), cpu_threads=2)
        segments, info = _model.transcribe(x, language=LANGUAGES[language],
            beam_size=3, word_timestamps=True, vad_filter=True,
            condition_on_previous_text=False, initial_prompt=hint)
        words, phrases = [], []
        for segment in segments:
            raw = [{'text': w.word, 'start': float(w.start), 'end': float(w.end),
                    'confidence': float(w.probability)} for w in (segment.words or [])]
            phrases.append({'text': segment.text.strip(), 'start': float(segment.start),
                            'end': float(segment.end)})
            if language == 'ja' and raw:
                from sudachipy import dictionary, tokenizer
                if _tokenizer is None:
                    _tokenizer = dictionary.Dictionary().create()
                chars, clock = '', []
                for w in raw:
                    chars += w['text']
                    clock.extend([w] * len(w['text']))
                for token in _tokenizer.tokenize(chars, tokenizer.Tokenizer.SplitMode.C):
                    a, b = token.begin(), token.end()
                    if token.surface().strip() and a < len(clock) and b > a:
                        words.append({'text': token.surface(), 'start': clock[a]['start'],
                                      'end': clock[b-1]['end'],
                                      'units': sum(c not in 'ャュョァィゥェォゃゅょぁぃぅぇぉ' for c in token.reading_form() if ('ァ' <= c <= 'ヺ') or c == 'ー'),
                                      'confidence': min(z['confidence'] for z in clock[a:b])})
            else:
                words.extend(raw)
        duration = len(x) / 16000
        words = [dict(w, start=round(max(0, w['start']), 3),
                      end=round(min(duration, w['end']), 3)) for w in words
                 if w['end'] > w['start'] and w['start'] < duration]
        import re
        if language == 'ja': units = sum(w.get('units', 0) for w in words); unit = 'mora/s'
        elif language == 'zh-CN': units = sum(len(re.findall(r'[\u4e00-\u9fff]', w['text'])) for w in words); unit = 'syllables/s'
        elif language == 'ko': units = sum(len(re.findall(r'[\uac00-\ud7a3]', w['text'])) for w in words); unit = 'syllables/s'
        else: units = sum(len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", w['text'])) for w in words); unit = 'words/min'
        result = {'pace': units/max(.25,duration)*(60 if language == 'en' else 1), 'pace_unit': unit, 'units': units, 'words': words, 'phrases': phrases, 'language': language,
                  'engine': 'faster-whisper large-v3-turbo / CUDA float16',
                  'timing': 'estimated', 'duration': duration}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False))
        return result
