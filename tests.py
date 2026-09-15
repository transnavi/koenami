import base64
import asyncio
import hashlib
import json
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from aiohttp.test_utils import TestClient, TestServer
from acoustics import measure, RATE
from server import create_app
from signals import visualise

ROOT=Path(__file__).parent

class AcousticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.x,cls.rate=sf.read(ROOT/'data/original-excerpt.wav')
        cls.original=measure(cls.x,cls.rate)

    def test_silence_and_noise_have_no_map_position(self):
        rng=np.random.default_rng(17)
        for audio in [np.zeros(RATE*5),rng.normal(0,.01,RATE*5)]:
            self.assertNotIn('delta_f',measure(audio)['features'])

    def test_known_pitch(self):
        t=np.arange(RATE*3)/RATE
        for hz in [110,180,260]:
            audio=sum(np.sin(2*np.pi*hz*n*t)/n for n in range(1,8))*.08
            self.assertAlmostEqual(measure(audio)['features']['f0'],hz,delta=1)

    def test_gain_does_not_move_the_voice_on_any_view(self):
        quiet=measure(self.x*.3,self.rate)
        for key in ['f0','delta_f','hnr','balance']:
            self.assertAlmostEqual(self.original['features'][key],quiet['features'][key],delta=.1)

    def test_resonance_shift_moves_right_at_similar_pitch(self):
        x,sr=sf.read(ROOT/'data/resonance-plus-10.wav');changed=measure(x,sr)
        self.assertLess(abs(changed['features']['f0']/self.original['features']['f0']-1),.03)
        self.assertGreater(changed['features']['delta_f']/self.original['features']['delta_f'],1.04)

    def test_pitch_shift_moves_up_at_similar_resonance(self):
        x,sr=sf.read(ROOT/'data/pitch-only-control.wav');changed=measure(x,sr)
        self.assertGreater(changed['features']['f0']/self.original['features']['f0'],1.2)
        self.assertLess(abs(changed['features']['delta_f']/self.original['features']['delta_f']-1),.06)

    def test_detailed_track_has_real_time_gaps_and_variation(self):
        m=measure(self.x,self.rate,detailed=True)
        self.assertGreater(len(m['track']),200)
        self.assertTrue(all(b['t']>a['t'] for a,b in zip(m['track'],m['track'][1:])))
        self.assertTrue(any(p['f0'] is None for p in m['track']))
        self.assertTrue(any(p['delta_f'] is not None for p in m['track']))
        self.assertGreater(m['features']['pitch_sd_st'],0)
        self.assertLessEqual(m['features']['quiet_pct'],100)
        self.assertTrue(all(p['end']-p['start']>=.249 for p in m['quiet_intervals']))

    def test_spectrum_frequency_and_bounded_visual_data(self):
        t=np.arange(RATE*4)/RATE
        x=.25*np.sin(2*np.pi*1000*t)
        v=visualise(x);sp=v['spectrum'];peak=np.argmax(sp['db'])*sp['hz_step']
        self.assertAlmostEqual(peak,1000,delta=sp['hz_step'])
        spec=v['spectrogram'];self.assertEqual(len(base64.b64decode(spec['data'])),spec['frames']*spec['bins'])
        self.assertLessEqual(spec['frames'],1401)
        self.assertLessEqual(len(v['waveform']),1600)
        self.assertTrue(all(a<=b for a,b in v['waveform']))
        self.assertTrue(np.isfinite(sp['db']).all())

    def test_original_full_recording_is_preserved(self):
        self.assertEqual(hashlib.sha256((ROOT/'data/baseline.wav').read_bytes()).hexdigest(),'7ba67115e794d8ba385219e4e309fa7b3896067b0e3f36f6308934214fde0656')
        m=json.loads((ROOT/'data/baseline.json').read_text())
        self.assertAlmostEqual(m['duration'],455.23,delta=.1)
        self.assertGreater(m['formant_seconds'],100)
        self.assertLess(m['resonance_sensitivity_pct'],5)
        self.assertNotIn('scores',m)

class CollectionTests(unittest.TestCase):
    def test_all_collected_audio_decodes_and_matches_manifest(self):
        library=json.loads((ROOT/'data/native-ja.json').read_text());clips=library['clips']
        self.assertEqual(len(clips),6675)
        self.assertEqual(len({p['id'] for p in clips}),6675)
        self.assertEqual(len({p['speaker'] for p in clips}),598)
        self.assertGreaterEqual(sum(p['plotted'] for p in clips),2940)
        self.assertTrue(all(p.get('native') for p in clips if p.get('dataset')=='JVS'))
        self.assertEqual(sum(p.get('dataset')=='Common Voice' for p in clips),1675)
        self.assertTrue(all(not p.get('native') for p in clips if p.get('selection_basis')=='common_voice_validated'))
        self.assertEqual(sum(p.get('dataset')=='JVS' for p in clips),5000)
        self.assertNotIn('common_voice_ja_20900022',{p['id'] for p in clips})
        self.assertNotIn('common_voice_ja_24736786',{p['id'] for p in clips})
        self.assertEqual(library['failures'],[])
        for p in clips:
            path=ROOT/'data/samples'/Path(p['audio']).name
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),p['sha256'])
            x,sr=sf.read(path)
            self.assertTrue(np.isfinite(x).all());self.assertGreater(len(x),0)
            self.assertAlmostEqual(len(x)/sr,p['duration'],delta=.002)
            if p['plotted']:
                self.assertGreaterEqual(p['voiced_seconds'],1)
                self.assertGreaterEqual(p['formant_seconds'],.35)
                self.assertLessEqual(p['tracking_sensitivity'],12)
            else:self.assertTrue(p['reason'])

    def test_expanded_corpora_and_synthetic_audio(self):
        for lang,count,speakers in [('zh-CN',1171,325),('en',1566,1239),('ko',799,28)]:
            lib=json.loads((ROOT/f'data/libraries/{lang}.json').read_text())
            self.assertEqual(len(lib['clips']),count)
            self.assertEqual(len({p['speaker'] for p in lib['clips']}),speakers)
            self.assertFalse(lib['failures'])
            for p in lib['clips']:
                path=ROOT/'data/samples'/Path(p['audio']).name
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),p['sha256'])
                x,sr=sf.read(path);self.assertTrue(np.isfinite(x).all());self.assertAlmostEqual(len(x)/sr,p['duration'],delta=.002)
        synthetic=json.loads((ROOT/'data/synthetic.json').read_text())['clips']
        self.assertEqual(len(synthetic),47)
        self.assertEqual({p['language'] for p in synthetic},{'ja','zh-CN','en','ko'})
        for p in synthetic:
            self.assertTrue(p['synthetic']);self.assertEqual(p['group'],'synthetic')
            x,sr=sf.read(ROOT/'data/samples'/Path(p['audio']).name);self.assertGreater(len(x),sr)

    def test_teacher_manifest_has_pinned_author_audio(self):
        clips=json.loads((ROOT/'data/research-demos.json').read_text())['clips']
        self.assertEqual(len(clips),170)
        self.assertEqual(len({p['speaker'] for p in clips}),4)
        for p in clips:
            self.assertTrue(p['audio'].startswith('https://raw.githubusercontent.com/berkeley-speech-group/'))
            self.assertIn(p['revision'],p['audio'])
            self.assertEqual(set(p['configuration']),{'pitch','resonance','weight'})
            if p['plotted']:
                self.assertLessEqual(p['tracking_sensitivity'],12)
                self.assertLessEqual(p['clipping_fraction'],.005)
                self.assertGreaterEqual(p['formant_seconds'],.1)

class APITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client=TestClient(TestServer(create_app()));await self.client.start_server()
    async def asyncTearDown(self):await self.client.close()

    async def test_malformed_audio_and_cross_origin_rejected(self):
        for body in [b'abc',np.array([float('nan')],dtype='<f4').tobytes(),np.array([4],dtype='<f4').tobytes()]:
            r=await self.client.post('/api/analyze',data=body);self.assertEqual(r.status,400)
        r=await self.client.get('/api/library',headers={'Origin':'https://example.com'});self.assertEqual(r.status,403)
        r=await self.client.get('/api/library',headers={'Host':'example.com'});self.assertEqual(r.status,403)
        r=await self.client.get('/samples/baseline.wav');self.assertEqual(r.status,404)

    async def test_live_silence_clears_activity(self):
        r=await self.client.post('/api/analyze?live=1',data=np.zeros(RATE*2,dtype='<f4').tobytes())
        self.assertEqual(r.status,200);m=await r.json();self.assertFalse(m['active']);self.assertEqual(m['features'],{})

    async def test_language_catalog_and_selected_region(self):
        r=await self.client.get('/api/catalog');catalog=await r.json()
        self.assertEqual([p['id'] for p in catalog['languages']],['ja','zh-CN','en','ko','lab'])
        r=await self.client.get('/api/library?lang=invalid');self.assertEqual(r.status,404)
        r=await self.client.get('/api/detail/baseline?start=5&end=7');self.assertEqual(r.status,200)
        m=await r.json();self.assertEqual(m['offset'],5);self.assertAlmostEqual(m['duration'],2,delta=.01)
        self.assertIn('spectrogram',m['visuals']);self.assertIn('pitch_sd_st',m['features'])
        for query in ['start=nan&end=7','start=-1&end=7','start=7&end=5','start=0&end=999']:
            r=await self.client.get('/api/detail/baseline?'+query);self.assertEqual(r.status,400)
        r=await self.client.get('/api/detail/not-a-sample');self.assertEqual(r.status,404)
        r=await self.client.post('/api/words?lang=invalid',data=np.zeros(RATE,dtype='<f4').tobytes());self.assertEqual(r.status,400)

    async def test_sample_range_and_whitelist(self):
        manifest=await (await self.client.get('/api/library')).json();sample=manifest['clips'][0]
        r=await self.client.get(sample['audio'],headers={'Range':'bytes=0-511'})
        self.assertEqual(r.status,206);self.assertEqual(len(await r.read()),512)
        self.assertIn('audio/',r.headers['Content-Type']);self.assertIn("frame-ancestors 'none'",r.headers['Content-Security-Policy'])
        r=await self.client.get('/data/library-measurements.json');self.assertEqual(r.status,404)

if __name__=='__main__':unittest.main(verbosity=2)
