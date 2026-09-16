"""Pronunciation exclusions must survive future Common Voice expansion."""
import unittest
import json
import tempfile
from pathlib import Path
from build_common_voice_ja import POLICY, selection, speaker_id
from curation import RATING_KEYS, SCALES, Verdicts, append
from screen_reference_speech import verdict


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.row = {'client_id': 'test-speaker', 'age': 'twenties',
                    'gender': 'female_feminine', 'up_votes': 2, 'down_votes': 0, 'accent': ''}

    def test_unreviewed_voice_is_included_without_native_claim(self):
        self.assertEqual(selection(self.row), 'common_voice_validated')

    def test_excluded_speaker_cannot_return_with_standard_accent(self):
        verdicts = Verdicts([{'speaker': speaker_id(self.row), 'ratings': {'japanese': 1}}])
        self.assertIsNone(selection({**self.row, 'accent': '標準語'}, POLICY, verdicts))

    def test_explicit_non_native_accents_are_excluded(self):
        for accent in POLICY['excluded_accents']:
            self.assertIsNone(selection({**self.row, 'accent': accent}))

    def test_declared_dialect_is_distinct_from_listening_review(self):
        self.assertEqual(selection({**self.row, 'accent': 'Hakata-ben'}), 'declared_japanese_accent')
        verdicts = Verdicts([{'speaker': speaker_id(self.row), 'ratings': {'japanese': 6}}])
        self.assertEqual(selection(self.row, POLICY, verdicts), 'reviewed_speaker')

    def test_validation_and_adult_reference_requirements(self):
        for change in [{'down_votes': 1}, {'up_votes': 1}, {'age': 'teens'}, {'age': ''}]:
            self.assertIsNone(selection({**self.row, **change}))

    def test_bad_clip_exclusion_does_not_remove_the_speaker(self):
        verdicts = Verdicts([{'speaker': speaker_id(self.row), 'clip': 'empty', 'flags': ['no_speech']}])
        self.assertIsNone(selection({**self.row, 'file_name': 'empty.mp3'}, POLICY, verdicts))
        self.assertEqual(selection({**self.row, 'file_name': 'other.mp3'}, POLICY, verdicts), 'common_voice_validated')


class ReviewLogTests(unittest.TestCase):
    def test_audio_exclusions_carry_no_pronunciation_label(self):
        v = Verdicts([{'speaker': 'a', 'clip': 'x', 'flags': ['distorted'], 'scope': 'speaker'}, {'speaker': 'b', 'ratings': {'japanese': 3}},
                      {'speaker': 'c', 'ratings': {'japanese': 2}}, {'speaker': 'd', 'ratings': {'japanese': 5}}, {'speaker': 'e', 'ratings': {'japanese': 4}}])
        self.assertEqual(v.excluded_speakers, {'a', 'b', 'c'})
        self.assertEqual(v.pronunciation_labels(), {'c': 0, 'd': 1})
        self.assertEqual(v.pronunciation['e'], 'unlabelled')

    def test_latest_pronunciation_judgement_wins(self):
        v = Verdicts([{'speaker': 'a', 'ratings': {'japanese': 6}}, {'speaker': 'a', 'ratings': {'japanese': 1}}])
        self.assertEqual(v.native_speakers, set()); self.assertEqual(v.pronunciation_labels(), {'a': 0}); self.assertEqual(v.excluded_speakers, {'a'})
        v = Verdicts([{'speaker': 'a', 'ratings': {'japanese': 3}}, {'speaker': 'a', 'ratings': {'japanese': 6}}])
        self.assertEqual(v.native_speakers, {'a'}); self.assertEqual(v.excluded_speakers, set()); self.assertEqual(v.pronunciation_labels(), {'a': 1})

    def test_quality_scope_decides_clip_or_speaker_exclusion(self):
        v = Verdicts([{'speaker': 'a', 'clip': 'x', 'flags': ['noise'], 'scope': 'clip'}, {'speaker': 'b', 'clip': 'y', 'flags': ['noise'], 'scope': 'speaker'}])
        self.assertEqual(v.excluded_clips, {'x'}); self.assertEqual(v.excluded_speakers, {'b'})

    def test_later_reviews_correct_quality_flags(self):
        v = Verdicts([{'speaker': 'a', 'clip': 'x', 'flags': ['noise'], 'scope': 'clip'}, {'speaker': 'a', 'clip': 'x', 'flags': [], 'scope': 'clip'},
                      {'speaker': 'b', 'clip': 'y', 'flags': ['distorted'], 'scope': 'speaker'}, {'speaker': 'b', 'clip': 'z', 'flags': [], 'scope': 'clip'},
                      {'speaker': 'c', 'clip': 'w', 'flags': ['distorted'], 'scope': 'speaker'}, {'speaker': 'c', 'clip': 'w', 'flags': [], 'scope': 'speaker'}])
        self.assertEqual(v.excluded_clips, set()); self.assertEqual(v.excluded_speakers, {'b'})
        self.assertEqual(v.latest('b')['flags'], []); self.assertEqual(v.latest('b')['clip'], 'z')

    def test_ratings_alone_do_not_exclude(self):
        v = Verdicts([{'speaker': 'a', 'clip': 'x', 'flags': [], 'ratings': {'femininity': 2}}])
        self.assertEqual(v.excluded_speakers, set()); self.assertEqual(v.ratings('femininity'), {'a': 2})

    def test_append_validates_and_persists(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'reviews.jsonl'
            record = append({'speaker': 'a', 'clip': 'x', 'flags': ['noise', 'noise'], 'ratings': {'age': 40, 'femininity': None}}, log)
            self.assertEqual(record['flags'], ['noise']); self.assertEqual(record['scope'], 'clip'); self.assertEqual(record['ratings'], {'age': 40})
            self.assertEqual(append({'speaker': 'a', 'flags': ['noise'], 'scope': 'speaker'}, log)['scope'], 'speaker')
            self.assertEqual(json.loads(log.read_text().splitlines()[0])['speaker'], 'a')
            for bad in [{'speaker': 'a', 'ratings': {'femininity': 9}}, {'speaker': 'a'}, {'speaker': 'a', 'flags': ['bogus']},
                        {'speaker': 'a', 'flags': ['noise']}, {'speaker': 'a', 'flags': ['noise'], 'scope': 'all'}, {'speaker': 'a', 'flags': ['native_like']},
                        {'speaker': 'a', 'flags': 'noise'}, {'speaker': 'a', 'ratings': {'age': True}}, {'speaker': 'a', 'ratings': {'age': 25}}, {'speaker': 'a', 'note': 'x' * 1001}, 'text']:
                with self.assertRaises(ValueError, msg=bad): append(bad, log)
            self.assertEqual(len(log.read_text().splitlines()), 2)

    def test_migrated_log_matches_previous_exclusions(self):
        migrated = [r for r in Verdicts().reviews if r['reviewed'].startswith('2026-09-15')]
        v = Verdicts(migrated)
        self.assertEqual(len(v.native_speakers), 3); self.assertEqual(len(v.excluded_speakers), 20); self.assertEqual(len(v.excluded_clips), 8)

    def test_every_scale_key_is_accepted(self):
        with tempfile.TemporaryDirectory() as folder:
            record = append({'speaker': 'a', 'ratings': {s['key']: (20 if s['key'] == 'age' else 3) for s in SCALES}}, Path(folder) / 'r.jsonl')
            self.assertEqual(set(record['ratings']), set(RATING_KEYS))


class SpeechScreenTests(unittest.TestCase):
    """Verdicts calibrated on the library: silence makes Whisper emit stock phrases."""

    def test_silence_with_stock_phrase_is_empty(self):
        self.assertEqual(verdict(0.0, .2, -68.1, 'ご視聴ありがとうございました', '昔は何のためにあるのか')[1], 'Whisper stock phrase')
        self.assertEqual(verdict(0.768, .75, -47.1, '次回予告', 'まだ消えちゃいないよ')[1], 'Whisper stock phrase')

    def test_empty_transcript_is_empty(self):
        self.assertEqual(verdict(0.032, .1, -57.4, '', '画面から離れて楽しんでね。')[1], 'Whisper heard nothing')

    def test_empty_transcript_at_normal_level_is_kept_for_listening(self):
        self.assertIsNone(verdict(0.448, 1.0, -30.5, '', '手順')[1])
        self.assertIsNone(verdict(0.128, .75, -27.3, 'こー', 'あああああ')[1])

    def test_quiet_but_intelligible_reading_is_kept(self):
        similarity, reason = verdict(0.384, .77, -51.3, 'これはお前が始めた物語だろ?', 'これはお前がはじめた物語だろ！')
        self.assertIsNone(reason); self.assertGreater(similarity, .9)

    def test_reading_missed_by_vad_is_kept_when_whisper_matches(self):
        self.assertIsNone(verdict(0.0, .2, -17.1, 'お菓子食べちゃった!', 'お菓子たべちゃった')[1])
        self.assertIsNone(verdict(0.512, 1.0, -27.6, 'お財布', 'おさいふ')[1])

    def test_faint_unintelligible_clip_is_empty(self):
        self.assertEqual(verdict(0.288, .94, -46.8, 'おはようございます。', '目に見える住宅の灯りは落ちている')[1], 'Faint, unintelligible')

    def test_stock_phrase_in_the_prompt_itself_is_not_a_hallucination(self):
        self.assertIsNone(verdict(0.6, 1.0, -25.0, 'おやすみなさい', 'おやすみなさい。')[1])
        self.assertIsNone(verdict(0.9, 1.0, -25.0, '音楽会は明日の夜に開かれると聞いた', '演奏会は今夜だと聞いた')[1])

    def test_short_word_with_low_similarity_is_kept_when_speech_was_detected(self):
        self.assertIsNone(verdict(0.672, 1.0, -26.8, 'GETS', 'ゲッツ')[1])


if __name__ == '__main__':
    unittest.main()
