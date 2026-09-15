"""Pronunciation exclusions must survive future Common Voice expansion."""
import unittest
from build_common_voice_ja import POLICY, selection, speaker_id


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


if __name__ == '__main__':
    unittest.main()
