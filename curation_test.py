"""Pronunciation exclusions must survive future Common Voice expansion."""
import unittest
from build_common_voice_ja import POLICY, selection, speaker_id
from screen_reference_speech import verdict


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.row = {'client_id': 'test-speaker', 'age': 'twenties',
                    'gender': 'female_feminine', 'up_votes': 2, 'down_votes': 0, 'accent': ''}

    def test_unreviewed_voice_is_included_without_native_claim(self):
        self.assertEqual(selection(self.row), 'common_voice_validated')

    def test_excluded_speaker_cannot_return_with_standard_accent(self):
        policy = {**POLICY, 'excluded_speakers': [speaker_id(self.row)]}
        self.assertIsNone(selection({**self.row, 'accent': '標準語'}, policy))

    def test_explicit_non_native_accents_are_excluded(self):
        for accent in POLICY['excluded_accents']:
            self.assertIsNone(selection({**self.row, 'accent': accent}))

    def test_declared_dialect_is_distinct_from_listening_review(self):
        self.assertEqual(selection({**self.row, 'accent': 'Hakata-ben'}), 'declared_japanese_accent')
        policy = {**POLICY, 'reviewed_speakers': {speaker_id(self.row): 'CV Test'}}
        self.assertEqual(selection(self.row, policy), 'reviewed_speaker')

    def test_validation_and_adult_reference_requirements(self):
        for change in [{'down_votes': 1}, {'up_votes': 1}, {'age': 'teens'}, {'age': ''}]:
            self.assertIsNone(selection({**self.row, **change}))

    def test_bad_clip_exclusion_does_not_remove_the_speaker(self):
        policy = {**POLICY, 'excluded_clips': ['empty']}
        self.assertIsNone(selection({**self.row, 'file_name': 'empty.mp3'}, policy))
        self.assertEqual(selection({**self.row, 'file_name': 'other.mp3'}, policy), 'common_voice_validated')

    def test_audio_exclusions_carry_no_pronunciation_label(self):
        firm = {r['speaker'] for r in POLICY['listening_reviews'] if r['judgement'] == 'not_native_like'}
        other = {r['speaker'] for r in POLICY['listening_reviews'] if r['judgement'] != 'not_native_like'}
        self.assertTrue(firm <= set(POLICY['excluded_speakers']))
        self.assertTrue(other.isdisjoint(firm))


class SpeechScreenTests(unittest.TestCase):
    """Verdicts calibrated on the library: silence makes Whisper emit stock phrases."""

    def test_silence_with_stock_phrase_is_empty(self):
        self.assertEqual(verdict(0.0, -68.1, 'ご視聴ありがとうございました', '昔は何のためにあるのか')[1], 'Whisper stock phrase')
        self.assertEqual(verdict(0.768, -47.1, '次回予告', 'まだ消えちゃいないよ')[1], 'Whisper stock phrase')

    def test_empty_transcript_is_empty(self):
        self.assertEqual(verdict(0.448, -30.5, '', '手順')[1], 'Whisper heard nothing')

    def test_quiet_but_intelligible_reading_is_kept(self):
        similarity, reason = verdict(0.384, -51.3, 'これはお前が始めた物語だろ?', 'これはお前がはじめた物語だろ！')
        self.assertIsNone(reason); self.assertGreater(similarity, .9)

    def test_reading_missed_by_vad_is_kept_when_whisper_matches(self):
        self.assertIsNone(verdict(0.0, -17.1, 'お菓子食べちゃった!', 'お菓子たべちゃった')[1])
        self.assertIsNone(verdict(0.512, -27.6, 'お財布', 'おさいふ')[1])

    def test_faint_unintelligible_clip_is_empty(self):
        self.assertEqual(verdict(0.288, -46.8, 'おはようございます。', '目に見える住宅の灯りは落ちている')[1], 'Faint, unintelligible')

    def test_stock_phrase_in_the_prompt_itself_is_not_a_hallucination(self):
        self.assertIsNone(verdict(0.6, -25.0, 'おやすみなさい', 'おやすみなさい。')[1])

    def test_short_word_with_low_similarity_is_kept_when_speech_was_detected(self):
        self.assertIsNone(verdict(0.672, -26.8, 'GETS', 'ゲッツ')[1])


if __name__ == '__main__':
    unittest.main()
