"""Window bounds and the timbre pooling of the prepared WavLM model."""
import json
import unittest
from unittest.mock import patch
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


class TimbreTests(unittest.TestCase):
    def test_timbre_pools_layer_frames_over_speech_in_one_centre_crop(self):
        calls=[]
        class Session:
            def get_outputs(self):return [type('O',(),{'name':n})() for n in ['embedding','timbre_frames']]
            def run(self,names,inputs):
                n=inputs['values'].shape[1];calls.append(n);frames=(n-400)//320+1
                return [np.arange(frames,dtype=np.float32)[None,:,None].repeat(768,axis=2)]
        x=np.sin(np.arange(16000*12)*.1).astype(np.float32);x[:16000*4]=0;x[-16000*4:]=0  # four seconds of silence at each end
        with patch.object(perception,'session',return_value=Session()):
            v=perception.timbre(x);short=perception.timbre(np.sin(np.arange(16000*3)*.1).astype(np.float32))
        self.assertEqual(calls,[128000,48000]);self.assertEqual(v.shape,(768,));self.assertEqual(short.shape,(768,))
        # The eight-second crop holds two seconds of silence at each end: frames 0–99 and 300–399 stay out of the mean.
        self.assertLess(abs(v[0]-199.5),8,v[0])

    def test_timbre_threshold_keeps_quiet_speech_and_drops_the_floor(self):
        class Session:
            def get_outputs(self):return [type('O',(),{'name':n})() for n in ['embedding','timbre_frames']]
            def run(self,names,inputs):
                frames=(inputs['values'].shape[1]-400)//320+1;return [np.arange(frames,dtype=np.float32)[None,:,None].repeat(768,axis=2)]
        t=np.arange(16000*4)/16000;x=np.sin(2*np.pi*200*t).astype(np.float32)
        x[:16000]*=10**(-50/20);x[16000:32000]*=10**(-30/20)  # the first second 50 dB down, the second 30 dB down
        with patch.object(perception,'session',return_value=Session()):v=perception.timbre(x)
        # 200 frames in all; the 50 frames at −50 dB are dropped, the 50 at −30 dB kept: the mean index sits at 124.5.
        self.assertLess(abs(v[0]-124.5),2,v[0])

    def test_timbre_crop_avoids_the_pause_between_two_audible_stretches(self):
        calls=[]
        class Session:
            def get_outputs(self):return [type('O',(),{'name':n})() for n in ['embedding','timbre_frames']]
            def run(self,names,inputs):
                calls.append(inputs['values'].copy());frames=(inputs['values'].shape[1]-400)//320+1
                return [np.arange(frames,dtype=np.float32)[None,:,None].repeat(768,axis=2)]
        rng=np.random.default_rng(1);x=rng.normal(0,.003,16000*30).astype(np.float32)  # room noise around -50 dBFS throughout
        tone=np.sin(np.arange(16000*3)*.1).astype(np.float32);x[:16000*3]+=tone;x[-16000*3:]+=tone  # audible at 0–3 s and 27–30 s only
        with patch.object(perception,'session',return_value=Session()):v=perception.timbre(x)
        self.assertTrue(np.array_equal(calls[0][0],x[:128000]))  # the window with the most audible frames; ties go toward the span centre, then the earlier one
        self.assertLess(abs(v[0]-74.5),3,v[0])  # pooled over the 150 tone frames only, not the noise
        # A recording whose audible span passes but which holds no window with enough speech is refused, not pooled.
        short=rng.normal(0,.003,16000*30).astype(np.float32);short[:4800]+=tone[:4800];short[-4800:]+=tone[:4800]
        with patch.object(perception,'session',return_value=Session()),self.assertRaises(ValueError):perception.timbre(short)

    def test_timbre_crop_finds_speech_that_starts_late(self):
        calls=[]
        class Session:
            def get_outputs(self):return [type('O',(),{'name':n})() for n in ['embedding','timbre_frames']]
            def run(self,names,inputs):
                calls.append(inputs['values'].copy());frames=(inputs['values'].shape[1]-400)//320+1;return [np.ones((1,frames,768),np.float32)]
        x=np.zeros(16000*30,np.float32);x[:16000]=np.sin(np.arange(16000)*.1);x[16000*20:]=np.sin(np.arange(16000*10)*.1)  # one second at the start, ten seconds from 20 s
        with patch.object(perception,'session',return_value=Session()):perception.timbre(x)
        self.assertTrue(np.array_equal(calls[0][0],x[16000*20:16000*28]))  # every window inside 20–30 s ties; the one nearest the span centre wins

    def test_timbre_crop_follows_speech_at_the_start_of_a_long_recording(self):
        calls=[]
        class Session:
            def get_outputs(self):return [type('O',(),{'name':n})() for n in ['embedding','timbre_frames']]
            def run(self,names,inputs):
                calls.append(inputs['values'].copy());frames=(inputs['values'].shape[1]-400)//320+1;return [np.ones((1,frames,768),np.float32)]
        x=np.zeros(16000*15,np.float32);x[:16000*3]=np.sin(np.arange(16000*3)*.1)  # three seconds of speech, then twelve of silence
        with patch.object(perception,'session',return_value=Session()):perception.timbre(x)
        self.assertTrue(np.array_equal(calls[0][0],x[:128000]))

    @unittest.skipUnless(perception.available(),'prepared models are absent')
    def test_prepared_model_exposes_embedding_and_timbre(self):
        x=(.3*np.sin(np.arange(16000*3)*2*np.pi*180/16000)).astype(np.float32)
        outputs=[o.name for o in perception.session('wavlm').get_outputs()]
        self.assertEqual(outputs,['embedding','timbre_frames'])
        manifest={m['name']:m for m in json.loads((perception.MODEL_DIR/'manifest.json').read_text())}
        self.assertEqual(manifest['wavlm']['timbre_layer'],int(perception.TIMBRE_VERSION.split('-l')[1].split('-')[0]))
        v=perception.timbre(x);self.assertEqual(v.shape,(768,));self.assertTrue(np.isfinite(v).all())
        self.assertAlmostEqual(float(np.linalg.norm(perception.describe(x)['embedding'])),1.0,places=4)

    @unittest.skipUnless(perception.available(['wavlm','timbre']),'prepared models are absent')
    def test_timbre_graph_returns_the_full_graphs_layer_3_frames(self):
        self.assertEqual([o.name for o in perception.session('timbre').get_outputs()],['timbre_frames'])
        rng=np.random.default_rng(0)
        for seconds in (2,5,8):
            x=(.1*rng.standard_normal(16000*seconds)).astype(np.float32)[None,:]
            full=perception.session('wavlm').run(['timbre_frames'],{'values':x})[0]
            cut=perception.session('timbre').run(['timbre_frames'],{'values':x})[0]
            self.assertTrue(np.array_equal(full,cut))

    @unittest.skipUnless(perception.available(['timbre',perception.TIMBRE_MODEL]),'prepared models are absent')
    def test_timbre_model_returns_one_frame_per_teacher_frame(self):
        self.assertEqual([o.name for o in perception.session(perception.TIMBRE_MODEL).get_outputs()],['timbre_frames'])
        rng=np.random.default_rng(0)
        for n in (32000,32319,80000,128000,128321):
            x=(.1*rng.standard_normal(n)).astype(np.float32)[None,:]
            teacher=perception.session('timbre').run(['timbre_frames'],{'values':x})[0]
            student=perception.session(perception.TIMBRE_MODEL).run(['timbre_frames'],{'values':x})[0]
            self.assertEqual(student.shape,teacher.shape)

    @unittest.skipUnless(perception.available([perception.TIMBRE_MODEL]),'prepared models are absent')
    def test_timbre_model_stays_finite_through_digital_silence(self):
        x=np.zeros(16000*4,np.float32);x[16000:48000]=(.3*np.sin(np.arange(32000)*2*np.pi*180/16000)).astype(np.float32)
        frames=perception.session(perception.TIMBRE_MODEL).run(['timbre_frames'],{'values':x[None,:]})[0]
        self.assertTrue(np.isfinite(frames).all())
        self.assertTrue(np.isfinite(perception.timbre(x)).all())


if __name__ == '__main__':
    unittest.main()
