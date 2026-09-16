"""Window bounds for the embedding model used by the pronunciation classifier build."""
import unittest
import numpy as np
import perception


class WindowTests(unittest.TestCase):
    def test_bounded_with_model_specific_preprocessing(self):
        x=np.sin(np.arange(16000*60)*.1).astype(np.float32)
        parts=perception.windows(x)
        self.assertEqual(len(parts),3)
        self.assertTrue(all(p.shape==(1,64000) for p in parts))
        self.assertTrue(all(abs(float(perception.age_input(p).mean()))<1e-5 for p in parts))
        self.assertEqual(len(perception.windows(x[:16000*6])),2)
        padded=np.pad(x[:64000],(16000*20,16000*20))
        self.assertLessEqual(len(perception.windows(padded)),2)

    def test_short_or_silent_rejected(self):
        for x in [np.zeros(64000,dtype=np.float32),np.ones(16000,dtype=np.float32)]:
            with self.assertRaises(ValueError):perception.windows(x)


if __name__ == '__main__':
    unittest.main()
