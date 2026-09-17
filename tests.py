import base64
import asyncio
import tempfile
from unittest.mock import patch
import hashlib
import json
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf
from aiohttp.test_utils import TestClient, TestServer
from acoustics import measure, RATE
from server import create_app, load_timbre_index
import server
import perception
import build_timbre_index
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

    def test_sparse_voicing_withholds_pitch_but_keeps_level_measures(self):
        rng=np.random.default_rng(3);t=np.arange(RATE*4)/RATE
        whisper=rng.normal(0,.05,RATE*4);seg=slice(RATE*2,RATE*2+int(RATE*.12))
        whisper[seg]+=.3*np.sin(2*np.pi*200*t[seg])
        m=measure(whisper)
        self.assertTrue(m['voicing']['sparse']);self.assertIsNotNone(m['reason'])
        self.assertEqual(m['features'],{});self.assertIn('quiet_intervals',m)
        self.assertGreater(m['active_seconds'],3);self.assertIn('peak',m)

    def test_voiced_fraction_stays_within_one_when_a_quiet_tail_is_voiced(self):
        t=np.arange(RATE*3)/RATE
        x=sum(np.sin(2*np.pi*180*n*t)/n for n in range(1,6))*.2
        # The last two seconds sit 26 dB down: above Praat's silence threshold (about -30 dB of the
        # peak) and the level gate (-35 dB), below speech level (-20 dB), so voiced but not speech-level.
        x[RATE:]*=10**(-26/20)
        m=measure(x)
        self.assertLessEqual(m['voicing']['voiced_fraction'],1);self.assertGreater(m['voicing']['voiced_fraction'],.9);self.assertFalse(m['voicing']['sparse'])
        self.assertGreater(m['voiced_seconds'],2)  # the quiet tail still counts as voiced speech

    def test_brief_speech_in_a_long_noisy_window_is_not_sparse(self):
        rng=np.random.default_rng(5);t=np.arange(RATE*8)/RATE
        x=rng.normal(0,.003,RATE*8);seg=slice(RATE*3,RATE*3+int(RATE*.5))
        x[seg]+=.2*sum(np.sin(2*np.pi*180*n*t[seg])/n for n in range(1,6))
        m=measure(x)
        self.assertFalse(m['voicing']['sparse']);self.assertGreater(m['voicing']['voiced_fraction'],.5)
        self.assertAlmostEqual(m['features']['f0'],180,delta=2);self.assertLess(m['active_seconds'],1.5)

    def test_halving_share_reports_missing_odd_harmonics_without_correcting(self):
        t=np.arange(RATE*3)/RATE
        tone=lambda hz:sum(np.sin(2*np.pi*hz*n*t)/n for n in range(1,8))*.08
        for hz in [170,340]:
            steady=measure(tone(hz))
            self.assertAlmostEqual(steady['features']['f0'],hz,delta=2);self.assertLess(steady['pitch_halving_pct'],5)
        # Praat follows the alternating 340/170 Hz signal at 170 Hz throughout (octave-jump cost
        # against 300 ms blocks); the 340 Hz stretches then lack odd harmonics of the tracked value.
        mixed=tone(340);half=(np.arange(len(t))//int(RATE*.3))%2==1;mixed[half]=tone(170)[half]
        m=measure(mixed)
        self.assertLess(m['features']['f0'],200);self.assertTrue(35<=m['pitch_halving_pct']<=65,m['pitch_halving_pct'])

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

class EngineTests(unittest.TestCase):
    """The Rust engine the libraries are built with, through `engine.py`."""
    @classmethod
    def setUpClass(cls):
        import engine
        if not engine.BINARY.exists():raise unittest.SkipTest('build measure/ first (cargo build --release)')
        cls.engine=engine
    def test_version_is_stamped_on_every_measurement(self):
        measured=self.engine.measure_files([ROOT/'data/original-excerpt.wav'])
        m=measured[str(ROOT/'data/original-excerpt.wav')]
        self.assertEqual(m['version'],self.engine.version())
        self.assertEqual(m['duration'],10)
        self.assertEqual(len(m['track']),100)
        for key in ['f0','delta_f','hnr','balance','pitch_span']:self.assertIn(key,m['features'])
    def test_cache_measures_only_other_versions(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'cache.json';path.write_text(json.dumps({'original-excerpt.wav':{'version':'3.0.0','features':{}},'baseline.wav':{'version':self.engine.version(),'features':{'f0':1}}}))
            cache=self.engine.Cache(path)
            got=cache.measure(ROOT/'data',['original-excerpt.wav','baseline.wav'])
            self.assertEqual(got['baseline.wav']['features'],{'f0':1})
            self.assertEqual(got['original-excerpt.wav']['version'],self.engine.version())
            self.assertIn('f0',got['original-excerpt.wav']['features'])
            self.assertNotIn('track',got['original-excerpt.wav'])
            self.assertEqual(json.loads(path.read_text())['original-excerpt.wav']['version'],self.engine.version())
    def test_a_file_the_engine_cannot_measure_raises_after_measuring_the_rest(self):
        with self.assertRaises(self.engine.MeasureError) as raised:self.engine.measure_files([ROOT/'README.md',ROOT/'data/baseline.wav'])
        self.assertEqual(list(raised.exception.errors),[str(ROOT/'README.md')])
        self.assertIn(str(ROOT/'data/baseline.wav'),raised.exception.measured)
    def test_cache_keeps_what_it_measured_before_a_failure_and_prunes(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'cache.json';path.write_text(json.dumps({'gone.wav':{'version':self.engine.version(),'features':{}}}))
            cache=self.engine.Cache(path)
            with self.assertRaises(self.engine.MeasureError):cache.measure(ROOT,['data/baseline.wav','README.md'])
            saved=json.loads(path.read_text())
            self.assertEqual(list(saved),['data/baseline.wav'])
            self.assertNotIn('quiet_intervals',saved['data/baseline.wav'])

class CollectionTests(unittest.TestCase):
    def test_every_library_carries_the_current_engine_version(self):
        """A library measured by an older engine has to be rebuilt."""
        import engine
        if not engine.BINARY.exists():self.skipTest('build measure/ first (cargo build --release)')
        for name in ['native-ja','common-voice-ja','synthetic','voicevox','research-demos','libraries/en','libraries/ko','libraries/zh-CN']:
            path=ROOT/f'data/{name}.json'
            if not path.exists():continue
            with self.subTest(library=name):
                self.assertEqual(json.loads(path.read_text())['version'],engine.version(),f'rebuild {name}: run its build_*.py')

    def test_all_collected_audio_decodes_and_matches_manifest(self):
        library=json.loads((ROOT/'data/native-ja.json').read_text());clips=library['clips']
        self.assertGreater(len(clips),6500)
        self.assertEqual(len({p['id'] for p in clips}),len(clips))
        # 100 JVS speakers and every Common Voice speaker the listening
        # reviews still admit — 448 of them as of batch 8, and falling as
        # reviews exclude more.
        self.assertGreater(len({p['speaker'] for p in clips}),500)
        self.assertGreaterEqual(sum(p['plotted'] for p in clips),2900)
        self.assertTrue(all(p.get('native') for p in clips if p.get('dataset')=='JVS'))
        self.assertGreater(sum(p.get('dataset')=='Common Voice' for p in clips),1500)
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

class SimilarTests(unittest.IsolatedAsyncioTestCase):
    """Reference ranking over a small synthetic index; the timbre model itself is patched out."""
    def fake_index(self):
        rng=np.random.default_rng(2);base=rng.normal(size=(4,768))
        ids,lang,spk,grp,syn,vec=[],[],[],[],[],[]
        for k,(speaker,group,language) in enumerate([('spkA','female','ja'),('spkB','female','ja'),('spkC','male','ja'),('spkD','female','en')]):
            for c in range(2):ids.append(f'{speaker}-clip{c}');lang.append(language);spk.append(speaker);grp.append(group);syn.append(False);vec.append((base[k]+rng.normal(scale=.05,size=768))*(10 if (speaker,c)==('spkC',1) else 1))  # spkC's clips differ tenfold in norm
        path=Path(self.tmp.name)/f'timbre-index-{perception.TIMBRE_VERSION}.npz'
        np.savez(path,version=perception.TIMBRE_VERSION,ids=np.array(ids),language=np.array(lang),speaker=np.array(spk),group=np.array(grp),synthetic=np.array(syn),vectors=np.array(vec,'float16'))
        # The app only serves index rows whose clips its libraries know, so give it minimal libraries.
        (Path(self.tmp.name)/'libraries').mkdir()
        for language,name in [('ja','native-ja.json'),('en','libraries/en.json')]:
            clips=[{'id':i,'audio':f'/samples/{i}.flac','speaker':s,'group':g,'plotted':True,'language':language} for i,s,g,l in zip(ids,spk,grp,lang) if l==language]
            (Path(self.tmp.name)/name).write_text(json.dumps({'version':'test','clips':clips}))
        self.base=base;return path

    async def asyncSetUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.fake_index()
        self.patches=[patch.object(server,'DATA',Path(self.tmp.name)),patch.object(perception,'timbre_ready',return_value=True)]
        for p in self.patches:p.start()
        self.client=TestClient(TestServer(create_app()));await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        for p in self.patches:p.stop()
        self.tmp.cleanup()

    async def test_similar_ranks_speakers_by_centroid_and_names_the_nearest_clip(self):
        r=await self.client.get('/api/catalog');self.assertEqual((await r.json())['capabilities']['similar'],['en','ja'])
        query=(self.base[1]+.5*self.base[0]).astype('float32')  # closest to spkB, then spkA
        with patch.object(perception,'timbre',return_value=query):
            r=await self.client.post('/api/similar?lang=ja&limit=2',data=np.zeros(RATE*3,dtype='<f4').tobytes())
        self.assertEqual(r.status,200);m=await r.json()
        self.assertEqual([s['speaker'] for s in m['speakers']],['spkB','spkA']);self.assertTrue(m['speakers'][0]['clip'].startswith('spkB-clip'))
        self.assertLess(m['speakers'][0]['distance'],m['speakers'][1]['distance']);self.assertEqual(m['indexed'],{'clips':6,'speakers':3})
        r=await self.client.post('/api/similar?lang=ko',data=np.zeros(RATE*3,dtype='<f4').tobytes());self.assertEqual(r.status,404)
        r=await self.client.post('/api/similar?lang=ja&limit=abc',data=np.zeros(RATE*3,dtype='<f4').tobytes());self.assertEqual(r.status,400)
        with patch.object(perception,'timbre',side_effect=ValueError('2秒以上の音声を選んでください。')):
            r=await self.client.post('/api/similar?lang=ja',data=np.zeros(RATE,dtype='<f4').tobytes());self.assertEqual(r.status,422)

    def test_index_loader_rejects_another_version_and_drops_unknown_clips(self):
        path=Path(self.tmp.name)/f'timbre-index-{perception.TIMBRE_VERSION}.npz'
        idx=load_timbre_index(Path(self.tmp.name),perception.TIMBRE_VERSION,known={'spkA-clip0','spkA-clip1','spkD-clip0'})
        self.assertEqual(sorted(idx),['en','ja']);self.assertEqual(idx['ja']['speakers'],['spkA']);self.assertEqual(idx['en']['clips'],1)
        # The centroid is the normalised mean of the raw vectors, so spkC's tenfold clip dominates it.
        full=load_timbre_index(Path(self.tmp.name),perception.TIMBRE_VERSION);rows=full['ja']['rows']['spkC'];raw=np.load(path)['vectors'].astype('float32')
        expected=raw[rows].mean(axis=0);expected/=np.linalg.norm(expected)
        self.assertTrue(np.allclose(full['ja']['centroids'][full['ja']['speakers'].index('spkC')],expected,atol=1e-5))
        raw=dict(np.load(path));raw['version']='other';np.savez(path,**raw)
        self.assertIsNone(load_timbre_index(Path(self.tmp.name),perception.TIMBRE_VERSION))
        np.savez(path,version=perception.TIMBRE_VERSION,ids=np.array(['x']),vectors=np.zeros((2,768),'float16'))  # misshapen: no crash, no index
        self.assertIsNone(load_timbre_index(Path(self.tmp.name),perception.TIMBRE_VERSION))

    async def test_similar_is_off_without_the_timbre_output_and_503_on_inference_failure(self):
        await self.client.close()
        with patch.object(perception,'timbre_ready',return_value=False):
            client=TestClient(TestServer(create_app()));await client.start_server()
            r=await client.get('/api/catalog');self.assertEqual((await r.json())['capabilities']['similar'],[])
            r=await client.post('/api/similar?lang=ja',data=np.zeros(RATE*3,dtype='<f4').tobytes());self.assertEqual(r.status,404);await client.close()
        self.client=TestClient(TestServer(create_app()));await self.client.start_server()
        class Boom(Exception):pass
        with patch.object(perception,'timbre',side_effect=Boom('onnx')):
            r=await self.client.post('/api/similar?lang=ja',data=np.zeros(RATE*3,dtype='<f4').tobytes());self.assertEqual(r.status,503)

    def test_index_build_resumes_and_skips_unreadable_clips(self):
        data=Path(self.tmp.name)/'build';(data/'samples').mkdir(parents=True)
        tone=(.3*np.sin(np.arange(RATE*3)*.1)).astype('float32')
        sf.write(data/'samples'/'a.flac',tone,RATE);sf.write(data/'samples'/'b.flac',tone,RATE);(data/'samples'/'c.flac').write_bytes(b'not audio')
        lib={'clips':[{'id':'a','audio':'/samples/a.flac','speaker':'s1','group':'female','plotted':True,'language':'ja'},
                      {'id':'b','audio':'/samples/b.flac','speaker':'s2','group':'male','plotted':True,'language':'ja'},
                      {'id':'c','audio':'/samples/c.flac','speaker':'s3','group':'male','plotted':True,'language':'ja'},
                      {'id':'d','audio':'/samples/a.flac','speaker':'s4','group':'male','plotted':False,'language':'ja'}]}
        (data/'native-ja.json').write_text(json.dumps(lib));out=data/'index.npz';calls=[]
        def fake_timbre(x):calls.append(len(x));return np.full(768,len(calls),np.float32)
        with patch.object(build_timbre_index,'DATA',data),patch.object(perception,'timbre',side_effect=fake_timbre),patch.object(perception,'timbre_ready',return_value=True):
            rows,skipped=build_timbre_index.main(out=out,checkpoint=1)
            self.assertEqual([r['id'] for r in rows],['a','b']);self.assertEqual([s[0] for s in skipped],['c'])  # d is not plotted, c is unreadable
            first=np.load(out)['vectors'].copy()
            lib['clips'].append({'id':'e','audio':'/samples/b.flac','speaker':'s5','group':'female','plotted':True,'language':'ja'});(data/'native-ja.json').write_text(json.dumps(lib))
            rows,_=build_timbre_index.main(out=out,checkpoint=1)
        self.assertEqual([r['id'] for r in rows],['a','b','e']);self.assertEqual(len(calls),3)  # a and b were kept, only e was encoded
        self.assertTrue(np.array_equal(np.load(out)['vectors'][:2],first));self.assertFalse(out.with_suffix('.tmp.npz').exists())


if __name__=='__main__':unittest.main(verbosity=2)
