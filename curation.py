"""Listening reviews are the single source for reference exclusions and classifier labels.

`curation/reviews.jsonl` holds one JSON object per review. Fields:

- speaker: stable speaker id (12-char hash of the Common Voice client id)
- clip: clip id the reviewer listened to (optional for speaker-level notes)
- display: label shown in the app at review time, kept for readability
- language: library language code
- flags: list of FLAGS keys; SPEAKER_FLAGS apply to every clip of the speaker
- ratings: optional 0-6 scores (age in years) keyed by RATING_KEYS
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
EXCLUDING_SPEAKER_FLAGS = {'not_native_like', 'tentative', 'distorted_audio'}


def load(path=LOG):
    if not path.exists(): return []
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def append(review, path=LOG):
    """Validate and add one review; returns the stored record."""
    flags = [f for f in review.get('flags', []) if f in FLAGS]
    ratings = {}
    for key, value in (review.get('ratings') or {}).items():
        if key not in RATING_KEYS or value is None: continue
        value = float(value)
        limit = (10, 90) if key == 'age' else (0, 6)
        if not limit[0] <= value <= limit[1]: raise ValueError(f'{key} out of range')
        ratings[key] = value
    if not review.get('speaker'): raise ValueError('speaker required')
    if not flags and not ratings and not review.get('note'): raise ValueError('empty review')
    record = {'speaker': review['speaker'], 'clip': review.get('clip'), 'display': review.get('display'),
              'language': review.get('language', 'ja'), 'flags': flags, 'ratings': ratings,
              'note': (review.get('note') or '').strip(), 'reviewed': datetime.now(timezone.utc).isoformat(timespec='seconds')}
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
        for r in reviews:
            flags = set(r.get('flags', []))
            if flags & EXCLUDING_SPEAKER_FLAGS: self.excluded_speakers.add(r['speaker'])
            if 'native_like' in flags: self.native_speakers.add(r['speaker'])
            if flags & CLIP_FLAGS.keys() and r.get('clip'): self.excluded_clips.add(r['clip'])
        # A firm non-native judgement outranks an earlier native-like one.
        self.native_speakers -= {r['speaker'] for r in reviews if 'not_native_like' in r.get('flags', [])}

    def pronunciation_labels(self):
        """1 for native-like, 0 for firmly non-native; tentative and audio exclusions carry no label."""
        labels = {s: 1 for s in self.native_speakers}
        labels.update({r['speaker']: 0 for r in self.reviews if 'not_native_like' in r.get('flags', [])})
        return labels

    def ratings(self, key):
        """Latest rating per speaker for one RATING_KEYS entry."""
        latest = {}
        for r in self.reviews:
            if key in r.get('ratings', {}): latest[r['speaker']] = r['ratings'][key]
        return latest
