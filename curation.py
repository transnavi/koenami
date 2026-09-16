"""Listening reviews are the single source for reference exclusions and classifier labels.

`curation/reviews.jsonl` holds one JSON object per review. Fields:

- speaker: stable speaker id (12-char hash of the Common Voice client id)
- clip: clip id the reviewer listened to (optional for speaker-level notes)
- display: label shown in the app at review time, kept for readability
- language: library language code
- flags: list of FLAGS keys; SPEAKER_FLAGS apply to every clip of the speaker
- ratings: optional 0-6 scores keyed by RATING_KEYS; `age` is the decade the voice sounds like (AGE_DECADES)
- note: free text
- reviewed: ISO timestamp

Verdicts are recomputed from the log on every read; nothing is edited in place.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent
LOG = ROOT / 'curation/reviews.jsonl'

RATING_KEYS = ('femininity', 'masculinity', 'naturalness', 'japanese', 'age')
# Perceived age as a decade: 10 covers teens and younger, 60 covers sixties and older.
AGE_DECADES = {10: '10代以下', 20: '20代', 30: '30代', 40: '40代', 50: '50代', 60: '60代以上'}
SPEAKER_FLAGS = {
    'native_like': '母語話者らしい',
    'not_native_like': '非母語らしい',
    'tentative': '非母語かもしれない',
    'distorted_audio': '音声が歪む・雑音（話者全体）',
}
CLIP_FLAGS = {
    'no_speech': '無音',
    'murmur': 'つぶやきのみ',
    'noise': '雑音',
    'other_speaker': '別の話者が混入',
    'distorted': '音声が歪む（この音声のみ）',
}
FLAGS = {**SPEAKER_FLAGS, **CLIP_FLAGS}
PRONUNCIATION_FLAGS = ('native_like', 'not_native_like', 'tentative')


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
    if len([f for f in flags if f in PRONUNCIATION_FLAGS]) > 1: raise ValueError('one pronunciation flag per review')
    if not review.get('clip') and any(f in CLIP_FLAGS for f in flags): raise ValueError('clip flags need a clip')
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
    note = review.get('note') or ''
    if not isinstance(note, str) or len(note) > 1000: raise ValueError('note must be text under 1000 characters')
    if not flags and not ratings and not note.strip(): raise ValueError('empty review')
    record = {'speaker': speaker, 'clip': review.get('clip') or None, 'display': review.get('display'),
              'language': review.get('language', 'ja'), 'flags': flags, 'ratings': ratings,
              'note': note.strip(), 'reviewed': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a') as f: f.write(json.dumps(record, ensure_ascii=False) + '\n')
    return record


class Verdicts:
    """Exclusions and labels derived from the log."""

    def __init__(self, reviews=None):
        reviews = load() if reviews is None else reviews
        self.reviews = reviews
        self.excluded_speakers, self.excluded_clips, self.native_speakers = set(), set(), set()
        self.reviewed_speakers = {r['speaker'] for r in reviews}
        self.reviewed_clips = {r['clip'] for r in reviews if r.get('clip')}
        # The latest pronunciation judgement per speaker wins, in log order.
        self.pronunciation = {}
        for r in reviews:
            flags = set(r.get('flags', []))
            for flag in PRONUNCIATION_FLAGS:
                if flag in flags: self.pronunciation[r['speaker']] = flag
            if 'distorted_audio' in flags: self.excluded_speakers.add(r['speaker'])
            if flags & CLIP_FLAGS.keys() and r.get('clip'): self.excluded_clips.add(r['clip'])
        self.native_speakers = {s for s, flag in self.pronunciation.items() if flag == 'native_like'}
        self.excluded_speakers |= {s for s, flag in self.pronunciation.items() if flag != 'native_like'}

    def pronunciation_labels(self):
        """1 for native-like, 0 for firmly non-native; tentative and audio exclusions carry no label."""
        return {s: 1 if flag == 'native_like' else 0 for s, flag in self.pronunciation.items() if flag != 'tentative'}

    def ratings(self, key):
        """Latest rating per speaker for one RATING_KEYS entry."""
        latest = {}
        for r in self.reviews:
            if key in r.get('ratings', {}): latest[r['speaker']] = r['ratings'][key]
        return latest
