"""Listening reviews are the single source for reference exclusions and classifier labels.

`curation/reviews.jsonl` holds one JSON object per review. Fields:

- speaker: stable speaker id (12-char hash of the Common Voice client id)
- clip: clip id the reviewer listened to (optional for speaker-level notes)
- display: label shown in the app at review time, kept for readability
- language: library language code
- flags: list of QUALITY keys (problems with this clip's audio)
- ratings: optional 0-6 scores keyed by RATING_KEYS; `age` is the decade the voice sounds like (AGE_DECADES).
  `japanese` doubles as the pronunciation judgement (see NATIVE_MIN and friends).
- mode: how the review was produced — 'new', 'update' (追加項目, prefilled), 'repeat' (blind second listen of the
  same clip) or 'speaker_repeat' (blind listen of another clip of a rated speaker)
- session: id of the rating session, so order effects and drift can be examined
- pass: which scale group was rated when the form was split ('all' or a group name)
- note: free text
- reviewed: ISO timestamp

A review describes one clip. Pronunciation (母語話者らしさ) is taken as a property of the speaker, everything
else stays with the clip. Verdicts are recomputed from the log on every read; nothing is edited in place.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
LOG = ROOT / 'curation/reviews.jsonl'
PAIRS = ROOT / 'curation/pairs.jsonl'

# Every rating is 0-6 except `age`. Groups and anchor words follow the literature cited in web/method.html#review.
SCALES = [
    {'key': 'femininity', 'name': '女性らしさ', 'ends': ['感じない', '強く感じる'], 'group': '性別・発音'},
    {'key': 'masculinity', 'name': '男性らしさ', 'ends': ['感じない', '強く感じる'], 'group': '性別・発音'},
    {'key': 'japanese', 'name': '母語話者らしさ', 'ends': ['非母語', '母語'], 'group': '性別・発音', 'only': 'ja'},
    {'key': 'naturalness', 'name': '自然さ', 'ends': ['不自然', '自然'], 'group': '性別・発音'},
    {'key': 'age', 'name': '聞こえる年代', 'group': '性別・発音', 'decades': True},
    {'key': 'clarity', 'name': '澄み', 'ends': ['かすれた', '澄んだ'], 'group': '声質'},
    {'key': 'firmness', 'name': '張り', 'ends': ['弱々しい', '張りのある'], 'group': '声質'},
    {'key': 'thickness', 'name': '太さ', 'ends': ['細い', '太い'], 'group': '声質'},
    {'key': 'nasality', 'name': '鼻声', 'ends': ['感じない', '強い'], 'group': '声質'},
    {'key': 'articulation', 'name': '滑舌', 'ends': ['ろれつが回らない', 'はっきり'], 'group': '話し方'},
    {'key': 'brightness', 'name': '明るさ', 'ends': ['暗い', '明るい'], 'group': '印象'},
    {'key': 'refinement', 'name': '上品さ', 'ends': ['雑', '上品'], 'group': '印象'},
    {'key': 'warmth', 'name': '温かさ', 'ends': ['冷たい', '温かい'], 'group': '印象'},
    {'key': 'sweetness', 'name': '甘さ', 'ends': ['感じない', '強く感じる'], 'group': '印象'},
]
RATING_KEYS = tuple(s['key'] for s in SCALES)
# Perceived age as a decade: 10 covers teens and younger, 60 covers sixties and older.
AGE_DECADES = {10: '10代以下', 20: '20代', 30: '30代', 40: '40代', 50: '50代', 60: '60代以上'}
# 母語話者らしさ is the only pronunciation judgement: 0-2 firmly non-native, 3 doubtful, 5-6 native-like.
NATIVE_MIN, NON_NATIVE_MAX, DOUBTFUL_MAX = 5, 2, 3
QUALITY = {
    'no_speech': '無音',
    'murmur': 'つぶやきのみ',
    'noise': '雑音',
    'distorted': '歪み',
}
# No longer offered in the review page: a listener cannot tell from one clip whether another person
# is speaking. Kept so earlier records still exclude; a speaker-embedding check will take this over.
RETIRED = {'other_speaker': '別の話者'}
FLAGS = QUALITY
PROBLEMS = {**QUALITY, **RETIRED}
# Pairwise judgements: two clips, three questions, answered a / b / same. Logged to PAIRS.
PAIR_QUESTIONS = {'femininity': 'どちらが女性らしい', 'naturalness': 'どちらが自然', 'preference': 'どちらを見本にしたい'}
PAIR_ANSWERS = ('a', 'b', 'same')


def load(path=LOG):
    if not path.exists(): return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def append(review, path=LOG):
    """Validate and add one review; returns the stored record."""
    if not isinstance(review, dict) or not isinstance(review.get('flags', []), list) or not isinstance(review.get('ratings') or {}, dict):
        raise ValueError('malformed review')
    flags = list(dict.fromkeys(review.get('flags', [])))
    unknown = [f for f in flags if f not in FLAGS]
    if unknown: raise ValueError(f'unknown flags: {unknown}')
    if not review.get('clip') and any(f in QUALITY for f in flags): raise ValueError('quality flags need a clip')
    ratings = {}
    for key, value in (review.get('ratings') or {}).items():
        if key not in RATING_KEYS or value is None: continue
        if isinstance(value, bool) or not isinstance(value, (int, float)): raise ValueError(f'{key} must be a number')
        if key == 'age':
            if value not in AGE_DECADES: raise ValueError('age must be one of ' + ', '.join(map(str, AGE_DECADES)))
            ratings[key] = int(value)
        else:
            if not 0 <= value <= 6: raise ValueError(f'{key} out of range')
            ratings[key] = float(value)
    speaker = review.get('speaker')
    if not isinstance(speaker, str) or not speaker: raise ValueError('speaker required')
    mode = review.get('mode') or 'new'
    if mode not in ('new', 'update', 'repeat', 'speaker_repeat'): raise ValueError('unknown mode')
    session = str(review.get('session') or '')[:40]
    rating_pass = str(review.get('pass') or 'all')[:20]
    note = review.get('note') or ''
    if not isinstance(note, str) or len(note) > 1000: raise ValueError('note must be text under 1000 characters')
    if flags: ratings = {}  # a clip with an audio problem gets no impression ratings
    if not flags and not ratings and not note.strip(): raise ValueError('empty review')
    record = {'speaker': speaker, 'clip': review.get('clip') or None, 'display': review.get('display'),
              'language': review.get('language', 'ja'), 'flags': flags, 'ratings': ratings, 'mode': mode, 'session': session, 'pass': rating_pass,
              'note': note.strip(), 'reviewed': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as f: f.write(json.dumps(record, ensure_ascii=False) + '\n')
    return record


def load_pairs(path=PAIRS):
    if not path.exists(): return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def append_pair(record, path=PAIRS):
    """Validate and add one pairwise judgement; returns the stored record."""
    if not isinstance(record, dict): raise ValueError('malformed pair')
    a, b = record.get('a'), record.get('b')
    if not isinstance(a, str) or not isinstance(b, str) or not a or not b or a == b: raise ValueError('two distinct clips required')
    answers = record.get('answers') or {}
    if not isinstance(answers, dict): raise ValueError('malformed answers')
    unknown = [k for k in answers if k not in PAIR_QUESTIONS]
    if unknown: raise ValueError(f'unknown questions: {unknown}')
    answers = {k: v for k, v in answers.items() if v is not None}
    if any(v not in PAIR_ANSWERS for v in answers.values()): raise ValueError('answers must be a, b or same')
    if not answers: raise ValueError('at least one answer')
    kind = record.get('kind') or 'near'
    if kind not in ('near', 'far'): raise ValueError('kind must be near or far')
    distance = record.get('distance')
    if distance is not None and (isinstance(distance, bool) or not isinstance(distance, (int, float))): raise ValueError('distance must be a number')
    out = {'a': a, 'b': b, 'language': record.get('language', 'ja'), 'answers': answers, 'kind': kind,
           'distance': None if distance is None else round(float(distance), 4), 'session': str(record.get('session') or '')[:40],
           'note': str(record.get('note') or '')[:1000].strip(), 'reviewed': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as f: f.write(json.dumps(out, ensure_ascii=False) + '\n')
    return out


class Verdicts:
    """Exclusions and labels derived from the log."""

    def __init__(self, reviews=None):
        reviews = load() if reviews is None else reviews
        self.reviews = reviews
        self.excluded_speakers, self.excluded_clips, self.native_speakers = set(), set(), set()
        self.reviewed_speakers = {r['speaker'] for r in reviews}
        self.reviewed_clips = {r['clip'] for r in reviews if r.get('clip')}
        # The latest 母語話者らしさ rating per speaker is the pronunciation judgement.
        japanese = self.ratings('japanese')
        self.pronunciation = {s: 'native_like' if v >= NATIVE_MIN else 'not_native_like' if v <= NON_NATIVE_MAX else 'tentative' if v <= DOUBTFUL_MAX else 'unlabelled'
                              for s, v in japanese.items()}
        # Quality flags can be corrected: the latest review that listened to a clip decides that clip.
        latest_clip = {}
        for r in reviews:
            if r.get('clip'): latest_clip[r['clip']] = r
        for clip, r in latest_clip.items():
            if set(r.get('flags', [])) & PROBLEMS.keys(): self.excluded_clips.add(clip)
        self.native_speakers = {s for s, flag in self.pronunciation.items() if flag == 'native_like'}
        self.excluded_speakers |= {s for s, flag in self.pronunciation.items() if flag in ('not_native_like', 'tentative')}

    def pronunciation_labels(self):
        """1 for native-like, 0 for firmly non-native; doubtful ratings and quality exclusions carry no label."""
        return {s: 1 if flag == 'native_like' else 0 for s, flag in self.pronunciation.items() if flag in ('native_like', 'not_native_like')}

    def latest(self, speaker):
        """Merged view of a speaker's reviews: latest value per rating key, flags of the latest review."""
        rows = [r for r in self.reviews if r['speaker'] == speaker]
        if not rows: return None
        ratings = {}
        for r in rows: ratings.update(r.get('ratings', {}))
        last = rows[-1]
        return {'ratings': ratings, 'flags': last.get('flags', []), 'clip': last.get('clip'), 'note': last.get('note', ''), 'reviewed': last.get('reviewed')}

    def ratings(self, key):
        """Latest rating per speaker for one RATING_KEYS entry."""
        latest = {}
        for r in self.reviews:
            if key in r.get('ratings', {}): latest[r['speaker']] = r['ratings'][key]
        return latest
