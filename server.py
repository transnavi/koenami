import argparse
import asyncio
import random
import io
import json
import logging
import os
import sys
from time import perf_counter
from collections import OrderedDict
from pathlib import Path
import numpy as np
import soundfile as sf
from aiohttp import web, ClientSession, ClientTimeout
from acoustics import measure, mono16, RATE
from signals import visualise
import curation
import own_voice
try: import perception
except ImportError: perception = None  # the public container ships no model runtime

ROOT = Path(__file__).parent
PUBLIC = os.environ.get('KOENAMI_PUBLIC') == '1'
DATA = Path(os.environ.get('KOENAMI_DATA', ROOT / 'data'))
LIMIT = 60 if PUBLIC else 900
LANGUAGES = {'ja': '日本語', 'zh-CN': '普通话', 'en': 'English', 'ko': '한국어'}
# Error text in the language the client asked for (Accept-Language names the studio's
# language); perception.py raises these keys as ValueError messages.
MESSAGES = {
    'audio_length': {'ja': '0.25秒〜{n}分の音声を使用してください。', 'zh-CN': '请使用0.25秒〜{n}分钟的音频。', 'en': 'Use audio between 0.25 seconds and {n} minutes long.', 'ko': '0.25초〜{n}분 길이의 음성을 사용해 주세요.'},
    'busy': {'ja': '解析が混み合っています。少し待ってからお試しください。', 'zh-CN': '分析服务繁忙，请稍等片刻再试。', 'en': 'The analyzer is busy. Wait a moment and try again.', 'ko': '분석이 몰려 있습니다. 잠시 기다렸다가 다시 시도해 주세요.'},
    'no_age_model': {'ja': '年齢の推定モデルが用意されていません。', 'zh-CN': '没有可用的年龄估计模型。', 'en': 'The age estimation model is not available.', 'ko': '나이 추정 모델이 준비되어 있지 않습니다.'},
    'age_too_long': {'ja': '1分以内の音声を使用してください。', 'zh-CN': '请使用1分钟以内的音频。', 'en': 'Use audio no longer than one minute.', 'ko': '1분 이내의 음성을 사용해 주세요.'},
    'too_short': {'ja': '2秒以上の音声を選んでください。', 'zh-CN': '请选择2秒以上的音频。', 'en': 'Choose audio of at least 2 seconds.', 'ko': '2초 이상의 음성을 골라 주세요.'},
    'too_quiet': {'ja': '声が小さすぎます。別の音声を選んでください。', 'zh-CN': '声音太小，请选择其他音频。', 'en': 'The voice is too quiet. Choose another clip.', 'ko': '목소리가 너무 작습니다. 다른 음성을 골라 주세요.'},
    'too_little_speech': {'ja': '2秒以上、話した音声を選んでください。', 'zh-CN': '请选择包含2秒以上说话声音的音频。', 'en': 'Choose audio with at least 2 seconds of speech.', 'ko': '2초 이상 말한 음성을 골라 주세요.'},
    'failed': {'ja': 'この音声の推定に失敗しました。', 'zh-CN': '无法对这段音频进行估计。', 'en': 'The estimate failed for this audio.', 'ko': '이 음성의 추정에 실패했습니다.'},
    'no_timbre_index': {'ja': 'この言語の参照声のインデックスがありません。', 'zh-CN': '这种语言没有参考声音的索引。', 'en': 'There is no reference voice index for this language.', 'ko': '이 언어의 참고 음성 인덱스가 없습니다.'},
    'compare_failed': {'ja': '声の比較に失敗しました。もう一度お試しください。', 'zh-CN': '声音比较失败，请重试。', 'en': 'The voice comparison failed. Try again.', 'ko': '목소리 비교에 실패했습니다. 다시 시도해 주세요.'},
}


def language(request):
    first = request.headers.get('Accept-Language', '').split(',')[0].split(';')[0].strip()
    if first in LANGUAGES: return first
    primary = first.split('-')[0].lower()
    return next((k for k in LANGUAGES if k.split('-')[0] == primary), 'ja')


def message(request, key, **params):
    return MESSAGES[key][language(request)].format(**params)


def analyze(x):
    result = measure(x, detailed=True)
    result['visuals'] = visualise(x)
    return result


def indexable(clip):
    """A reference clip the timbre index covers: plotted, and served from the sample store."""
    return bool(clip.get('plotted')) and str(clip.get('audio', '')).startswith('/samples/')


def load_timbre_index(data, version, known=None):
    """The timbre vectors build_timbre_index.py wrote for this descriptor version, arranged per language:
    unit vectors per clip, one centroid per speaker (the mean of the raw vectors, as in the benchmark,
    normalised once), and the clip rows of each speaker. Rows whose clip the app no longer serves are
    dropped. None when the file is absent, for another version, or empty."""
    path = data / f'timbre-index-{version}.npz'
    if not path.is_file(): return None
    try:
        raw = np.load(path, allow_pickle=False)
        if str(raw['version']) != version:
            print(f'{path.name} was built for {raw["version"]}, not {version}; rebuild it', flush=True); return None
        ids, language, speaker, group, synthetic = (raw[k] for k in ['ids', 'language', 'speaker', 'group', 'synthetic'])
        keep = np.isin(ids, list(known)) if known is not None else np.ones(len(ids), bool)
        if raw['vectors'].ndim != 2 or len(raw['vectors']) != len(ids) or not keep.any(): raise ValueError('empty or misshapen index')
        raw_vectors = raw['vectors'][keep].astype('float32'); ids, language, speaker, group, synthetic = ids[keep], language[keep], speaker[keep], group[keep], synthetic[keep]
    except (KeyError, ValueError, OSError) as error:
        print(f'{path.name} could not be loaded: {type(error).__name__}: {error}', flush=True); return None
    vectors = raw_vectors / np.maximum(np.linalg.norm(raw_vectors, axis=1, keepdims=True), 1e-8)
    index = {}
    for lang in np.unique(language):
        rows = np.flatnonzero(language == lang); speakers = sorted(set(speaker[rows].tolist()))
        by_speaker = {s: rows[speaker[rows] == s] for s in speakers}
        centroids = np.array([raw_vectors[by_speaker[s]].mean(axis=0) for s in speakers]); centroids /= np.maximum(np.linalg.norm(centroids, axis=1, keepdims=True), 1e-8)
        index[str(lang)] = {'ids': ids, 'vectors': vectors, 'group': group, 'synthetic': synthetic,
                            'speakers': speakers, 'centroids': centroids, 'rows': by_speaker, 'clips': len(rows)}
    return index


def rank_similar(index, vector, limit):
    """Speakers nearest to a timbre vector by cosine distance to their centroid, each with its nearest clip."""
    v = vector / max(float(np.linalg.norm(vector)), 1e-8)
    order = np.argsort(1 - index['centroids'] @ v)[:limit]; out = []
    for i in order:
        speaker = index['speakers'][i]; rows = index['rows'][speaker]; clip_distance = 1 - index['vectors'][rows] @ v; j = int(np.argmin(clip_distance)); row = rows[j]
        out.append({'speaker': speaker, 'group': str(index['group'][row]), 'synthetic': bool(index['synthetic'][row]),
                    'distance': round(float(1 - index['centroids'][i] @ v), 4), 'clip': str(index['ids'][row]), 'clip_distance': round(float(clip_distance[j]), 4)})
    return out


def create_app():
    libraries = {}
    for lang in LANGUAGES:
        path = DATA / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json')
        if path.exists(): libraries[lang] = json.loads(path.read_text())
    if not PUBLIC and (DATA / 'research-demos.json').exists(): libraries['lab'] = json.loads((DATA / 'research-demos.json').read_text())
    for filename in ['synthetic.json', 'voicevox.json']:
        synthetic = DATA / filename
        if synthetic.exists():
            for clip in json.loads(synthetic.read_text())['clips']:
                if clip['language'] in libraries: libraries[clip['language']]['clips'].append(clip)
    clips = {s['id']: s for lib in libraries.values() for s in lib['clips']}
    sample_files = {Path(s['audio']).name for s in clips.values() if s['audio'].startswith('/samples/')}
    # The listener's own takes: local only, never part of a library or a public build.
    own_clips, own_paths = ([], {}) if PUBLIC else own_voice.load(DATA)
    clips.update({c['id']: c for c in own_clips})
    gate, asr_gate = asyncio.Semaphore(1), asyncio.Semaphore(1)
    neural_gate = asyncio.Semaphore(1)
    # Reference ranking needs an index built for this descriptor version and a prepared WavLM graph that
    # carries the timbre output; the graph is opened here so the first request does not pay for it.
    timbre_index = load_timbre_index(DATA, perception.TIMBRE_VERSION, known={i for i, c in clips.items() if indexable(c)}) if perception else None
    if timbre_index and not perception.timbre_ready():
        print('Reference ranking is off: the prepared WavLM graph lacks the timbre output; run prepare_voice_models.py', flush=True); timbre_index = None
    cache = OrderedDict()
    pcm_cache = OrderedDict()

    @web.middleware
    async def local_only(request, handler):
        if request.host.split(':')[0] not in ['localhost', '127.0.0.1', *(['koe.transnavi.jp'] if PUBLIC else [])]:
            raise web.HTTPForbidden(text='Open this app through localhost.')
        origin = request.headers.get('Origin')
        if origin and origin != f'{request.scheme}://{request.host}':
            raise web.HTTPForbidden(text='Cross-origin requests are disabled.')
        response = await handler(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'"
        return response

    def respond(value, **kwargs):
        kwargs.setdefault('dumps', lambda v: json.dumps(v, allow_nan=False))
        return web.json_response(value, **kwargs)

    app = web.Application(client_max_size=RATE*4*LIMIT+1024, middlewares=[local_only])

    async def read_audio(request):
        body = await request.read()
        if not body or len(body) % 4 or not RATE <= len(body) <= RATE*4*LIMIT:
            raise web.HTTPBadRequest(text=message(request, 'audio_length', n=LIMIT // 60))
        x = np.frombuffer(body, dtype='<f4').copy()
        if not np.isfinite(x).all() or np.max(np.abs(x)) > 1.01:
            raise web.HTTPBadRequest(text='Invalid audio samples.')
        return x

    async def known_audio(name):
        if name in pcm_cache:
            pcm_cache.move_to_end(name)
            return pcm_cache[name]
        if name == 'baseline' and not PUBLIC: path = DATA / 'baseline.wav'
        elif name in clips:
            clip = clips[name]
            if clip['audio'].startswith('/samples/'):
                path = DATA / 'samples' / Path(clip['audio']).name
            else:
                if PUBLIC: raise web.HTTPNotFound()
                async with ClientSession(timeout=ClientTimeout(total=30)) as session:
                    async with session.get(clip['audio']) as response:
                        response.raise_for_status()
                        if response.content_length and response.content_length > 40_000_000:
                            raise web.HTTPBadRequest(text='Reference audio is too large.')
                        body = bytearray()
                        async for chunk in response.content.iter_chunked(262144):
                            if len(body)+len(chunk) > 40_000_000:
                                raise web.HTTPBadRequest(text='Reference audio is too large.')
                            body.extend(chunk)
                        path = io.BytesIO(body)
        else: raise web.HTTPNotFound()
        x, sr = await asyncio.to_thread(sf.read, path, dtype='float32')
        x = mono16(x, sr).astype(np.float32)
        pcm_cache[name] = x
        while sum(v.nbytes for v in pcm_cache.values()) > 64_000_000 or len(pcm_cache) > 16:
            pcm_cache.popitem(last=False)
        return x

    async def measurement(request):
        if PUBLIC and request.query.get('live') == '1' and gate.locked(): raise web.HTTPServiceUnavailable(text=message(request, 'busy'), headers={'Retry-After': '1'})
        x = await read_audio(request)
        queued = perf_counter()
        async with gate:
            started = perf_counter()
            try:
                if request.query.get('live') == '1':
                    if len(x) > RATE*12: raise web.HTTPBadRequest(text='Live window is too long.')
                    result = await asyncio.to_thread(measure, x, RATE, True)
                    recent = [p for p in result['track'] if p['t'] > len(x)/RATE-.5]
                    result['active'] = sum(p['f0'] is not None for p in recent) >= 2
                    result['visuals'] = await asyncio.to_thread(visualise, x)
                else: result = await asyncio.to_thread(analyze, x)
                return respond(result, headers={'Server-Timing':
                    f'queue;dur={(started-queued)*1000:.1f}, analysis;dur={(perf_counter()-started)*1000:.1f}'})
            except (ValueError, RuntimeError):
                raise web.HTTPUnprocessableEntity(text='Could not measure this audio.')

    async def age(request):
        """Age impression from the audEERING model; absent when the prepared model is not shipped."""
        import perception
        if not perception.available(['age']): raise web.HTTPNotFound(text=message(request, 'no_age_model'))
        x = await read_audio(request)
        if len(x) > RATE * 60: raise web.HTTPBadRequest(text=message(request, 'age_too_long'))
        async with neural_gate:
            try: return respond(await asyncio.to_thread(perception.age, x))
            except ValueError as error: raise web.HTTPUnprocessableEntity(text=message(request, str(error)) if str(error) in MESSAGES else str(error))

    async def similar(request):
        """Reference speakers whose voices sit closest to the recording, by the layer-3 timbre descriptor."""
        lang = request.query.get('lang', 'ja')
        if not timbre_index or lang not in timbre_index: raise web.HTTPNotFound(text=message(request, 'no_timbre_index'))
        try: limit = max(1, min(int(request.query.get('limit', '12')), 50))
        except (ValueError, TypeError): raise web.HTTPBadRequest(text='limit must be a number.')
        if PUBLIC and neural_gate.locked(): raise web.HTTPServiceUnavailable(text=message(request, 'busy'), headers={'Retry-After': '2'})
        x = await read_audio(request)
        async with neural_gate:
            try: vector = await asyncio.to_thread(perception.timbre, x)
            except ValueError as e: raise web.HTTPUnprocessableEntity(text=str(e))
            except Exception as error:  # ONNX Runtime raises its own classes, none of them RuntimeError
                print(f'Timbre inference failed: {type(error).__name__}', flush=True)
                raise web.HTTPServiceUnavailable(text=message(request, 'compare_failed'))
        index = timbre_index[lang]
        return respond({'version': perception.TIMBRE_VERSION, 'language': lang, 'speakers': rank_similar(index, vector, limit),
                        'indexed': {'clips': index['clips'], 'speakers': len(index['speakers'])}})

    async def detail(request):
        name = request.match_info['name']
        start, end = request.query.get('start'), request.query.get('end')
        key = (name, start, end)
        if key in cache:
            cache.move_to_end(key)
            return respond(cache[key])
        x = await known_audio(name)
        async with gate:
            offset = 0
            if start is not None or end is not None:
                try:
                    a, b = float(start), float(end)
                    if not np.isfinite([a, b]).all() or a < 0 or b-a < .25 or b > len(x)/RATE+.002: raise ValueError()
                except (ValueError, TypeError): raise web.HTTPBadRequest(text='Invalid time selection.')
                x = x[round(a*RATE):round(b*RATE)]; offset = a
            result = await asyncio.to_thread(analyze, x)
            result['offset'] = offset
            cache[key] = result
            while len(cache) > 12: cache.popitem(last=False)
            return respond(result)

    async def words(request):
        if PUBLIC: raise web.HTTPNotFound()
        lang = request.query.get('lang', 'ja')
        if lang not in LANGUAGES: raise web.HTTPBadRequest(text='Unsupported language.')
        x = await known_audio(request.match_info['name']) if 'name' in request.match_info else await read_audio(request)
        from words import transcribe
        async with asr_gate:
            try:
                hint = clips.get(request.match_info.get('name'), {}).get('text')
                result = await asyncio.to_thread(transcribe, x, lang, hint)
                return respond(result)
            except Exception as error:
                print(f'Word timing failed: {type(error).__name__}', flush=True)
                raise web.HTTPServiceUnavailable(text='Word timing is unavailable. Select a range on the waveform.')

    async def catalog(request):
        return respond({'capabilities': {'words': not PUBLIC, 'maxSeconds': LIMIT, 'review': not PUBLIC, 'similar': sorted(timbre_index) if timbre_index else []}, 'languages': [dict(id=k, label=v,
            clips=sum(not s.get('synthetic') for s in libraries[k]['clips']),
            speakers=len({s['speaker'] for s in libraries[k]['clips'] if not s.get('synthetic')}),
            synthetic=sum(bool(s.get('synthetic')) for s in libraries[k]['clips']))
            for k, v in LANGUAGES.items() if k in libraries] +
            ([{'id': 'lab', 'label': 'Voice lab', 'clips': len(libraries['lab']['clips']), 'speakers': 4}] if 'lab' in libraries else [])})

    async def metadata(request):
        lang = request.query.get('lang', 'ja')
        if lang not in libraries: raise web.HTTPNotFound()
        return respond(libraries[lang])

    async def sample(request):
        name = request.match_info['file']
        if name in own_paths: return web.FileResponse(own_paths[name])
        if name not in sample_files: raise web.HTTPNotFound()
        response = web.FileResponse(DATA / 'samples' / name)
        if name.lower().endswith('.flac'): response.content_type = 'audio/flac'
        return response

    async def data_file(request):
        if PUBLIC: raise web.HTTPNotFound()
        name = request.match_info['file']
        if name not in {'baseline.json', 'baseline.wav', 'baseline-words.json'} or not (ROOT/'data'/name).is_file(): raise web.HTTPNotFound()
        return web.FileResponse(ROOT / 'data' / name)

    async def import_index(request):
        return web.FileResponse(DATA / 'jvs-import-index.json')

    app.router.add_get('/api/import-index/jvs', import_index)

    JVS_PARALLEL = ('VOICEACTRESS100_025', 'VOICEACTRESS100_033', 'VOICEACTRESS100_064')

    def review_queue(lang, mode='new', session=''):
        """One representative clip per human speaker, order shuffled with the session as seed.

        mode 'new' lists unreviewed speakers with blind repeats mixed in; 'update' lists reviewed speakers whose
        ratings miss a current scale.
        """
        verdicts = curation.Verdicts()
        # Three pools so the ratings gain range: Common Voice speakers, JVS professionals on one parallel sentence
        # (the same text for all 100, so voice differences are not sentence differences), and VOICEVOX synthetic voices.
        by_speaker, pool_of = {}, {}
        for c in libraries[lang]['clips']:
            if c.get('dataset') == 'JVS':
                if c.get('utterance') not in JVS_PARALLEL: continue
                pool = 'jvs'
            else: pool = 'synthetic' if c.get('synthetic') else 'cv'
            by_speaker.setdefault(c['speaker'], []).append(c); pool_of[c['speaker']] = pool
        if lang == 'ja':
            for c in own_clips: by_speaker[c['speaker']] = [c]; pool_of[c['speaker']] = 'own'
        queue = []
        for sid, clips in by_speaker.items():
            if pool_of[sid] == 'jvs': best = next((c for c in clips if c.get('utterance') == JVS_PARALLEL[0]), clips[0])
            else: best = max(clips, key=lambda c: (bool(c.get('plotted')), c.get('duration', 0)))
            queue.append({'speaker': sid, 'pool': pool_of[sid], 'clips': [dict(id=c['id'], display='VOICEVOX' if c.get('synthetic') else '自分' if c.get('private') else (c.get('display_label') or c.get('name') or sid), text=c.get('text') or ('（自分の録音）' if c.get('private') else ''),
                          audio=c['audio'], duration=c.get('duration'), plotted=bool(c.get('plotted'))) for c in sorted(clips, key=lambda c: c['id'])], 'first': best['id']})
        rng = random.Random(session or 'koenami')
        rng.shuffle(queue)
        reviewed = {r['speaker'] for r in verdicts.reviews if r.get('language', 'ja') == lang}
        keys = [s['key'] for s in curation.SCALES if not s.get('only') or s['only'] == lang]
        if mode == 'update':
            queue = [q for q in queue if q['speaker'] in reviewed]
            for q in queue:
                q['previous'] = verdicts.latest(q['speaker'])
                q['missing'] = [k for k in keys if k not in q['previous']['ratings']]
                if q['previous']['clip'] in {c['id'] for c in q['clips']}: q['first'] = q['previous']['clip']
            # Speakers whose last listen flagged the audio get no impression ratings; they are curated, not rated.
            queue = [q for q in queue if q['missing'] and not q['previous']['flags']]
        else:
            # Unreviewed speakers interleaved 5 : 2 : 1 (Common Voice : JVS : synthetic) until a pool runs dry.
            pools = {name: [q for q in queue if q['speaker'] not in reviewed and q['pool'] == name] for name in ('cv', 'jvs', 'synthetic', 'own')}
            pattern = ['cv', 'cv', 'jvs', 'own', 'cv', 'cv', 'synthetic', 'own']
            fresh = []
            while any(pools.values()):
                for name in pattern:
                    if pools[name]: fresh.append(pools[name].pop())
            # Blind repeats, empty form, no marker. Every eighth item alternates between the same clip rated in an
            # earlier session (rater reliability) and an unheard clip of a rated speaker (speaker consistency).
            heard = {r['clip'] for r in verdicts.reviews if r.get('clip')}
            earlier = [r for r in verdicts.reviews if r.get('clip') and r.get('mode', 'new') == 'new' and r['ratings'] and r.get('session') != session]
            by_id = {c['id']: q for q in queue for c in q['clips']}
            same = [dict(by_id[r['clip']], first=r['clip'], repeat='repeat') for r in earlier if r['clip'] in by_id and not r['flags']]
            other = [dict(q, first=next(c['id'] for c in q['clips'] if c['id'] not in heard and c['plotted']), repeat='speaker_repeat')
                     for q in queue if q['speaker'] in reviewed and any(c['id'] not in heard and c['plotted'] for c in q['clips'])]
            rng.shuffle(same); rng.shuffle(other)
            # Same-clip repeats first: reliability per scale needs ~30 of them before the ratings can be judged
            # against a ceiling; until the log holds that many, every eighth item is a same-clip repeat.
            same_done = sum(1 for r in verdicts.reviews if r.get('mode') == 'repeat')
            queue = []
            for i, q in enumerate(fresh):
                queue.append(q)
                if i % 8 == 7:
                    pool = same if (same_done < 30 or (i // 8) % 2 == 0) and same else other
                    if pool: queue.append(pool.pop())
        return {'language': lang, 'mode': mode, 'reviewed': len(reviewed), 'queue': queue}

    def anchors(lang):
        """Rated clips at the ends of three scales, replayable while rating so the scale points stay put."""
        verdicts = curation.Verdicts()
        clips = {c['id']: c for c in libraries[lang]['clips']}
        rows = [r for r in verdicts.reviews if r.get('clip') in clips and r['ratings'] and not r['flags'] and r.get('language', 'ja') == lang]
        out = []
        for key in ['femininity', 'naturalness', 'thickness']:
            rated = [r for r in rows if key in r['ratings']]
            if len(rated) < 6: continue
            low = min(rated, key=lambda r: (r['ratings'][key], -clips[r['clip']].get('duration', 0)))
            high = max(rated, key=lambda r: (r['ratings'][key], clips[r['clip']].get('duration', 0)))
            for r, end in ((low, 'low'), (high, 'high')):
                out.append({'scale': key, 'end': end, 'value': r['ratings'][key], 'clip': r['clip'], 'audio': clips[r['clip']]['audio'], 'display': clips[r['clip']].get('display_label')})
        return out

    async def own_timbre_vectors():
        """Timbre vectors of the listener's own takes, cached beside the measurements under the descriptor version.
        Missing ones are computed off the loop under the neural gate; only successes are kept, so a take that
        failed once is tried again next time."""
        if not timbre_index or not own_clips: return {}
        cache_path = DATA / 'own' / f'timbre-{perception.TIMBRE_VERSION}.json'
        cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
        missing = [c for c in own_clips if c.get('plotted') and c['id'] not in cache]
        if missing:
            async with neural_gate:
                for c in missing:
                    try:
                        audio, rate = sf.read(own_paths[Path(c['audio']).name], dtype='float32')
                        vector = await asyncio.to_thread(perception.timbre, mono16(audio, rate).astype('float32'))
                        cache[c['id']] = [round(float(v), 5) for v in vector]
                    except Exception as error: print(f'Own take {c["id"]} not embedded: {type(error).__name__}', flush=True)
            cache_path.write_text(json.dumps(cache))
        return {k: np.array(v, 'float32') for k, v in cache.items()}

    def pair_queue(lang, session='', own_vectors=None):
        """Pairs of plotted human clips for listening judgements: mostly near neighbours, some far ones, a few
        same-speaker pairs, and repeats of judged pairs for test–retest. Distances come from the timbre index
        when it is loaded (the space the app ranks references by), else from the standardized five features."""
        keys = ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']
        def measured(c): return c.get('features') and all(isinstance(c['features'].get(k), (int, float)) for k in keys) and c['features']['f0'] > 0
        index = timbre_index.get(lang) if timbre_index else None
        human = [c for c in libraries[lang]['clips'] if c.get('plotted') and not c.get('synthetic')]
        if index:
            position = {str(i): n for n, i in enumerate(index['ids'])}
            pool = [c for c in human if c['id'] in position]; X = index['vectors'][[position[c['id']] for c in pool]]
            space = f'timbre:{perception.TIMBRE_VERSION}'
            def unit(v): return v / max(float(np.linalg.norm(v)), 1e-8)
            def dist(v): return 1 - X @ unit(v)
            def between(u, v): return float(1 - unit(u) @ unit(v))
            def own_vector(c): return (own_vectors or {}).get(c['id'])
        else:
            pool = [c for c in human if measured(c)]
            if len(pool) < 8: return []
            X = np.array([[12 * np.log2(c['features']['f0'])] + [c['features'][k] for k in keys[1:]] for c in pool], float)
            mean, std = X.mean(0), X.std(0) + 1e-9; X = (X - mean) / std; space = 'acoustic-five'
            def dist(v): return np.sqrt(((X - v) ** 2).sum(1))
            def between(u, v): return float(np.sqrt(((u - v) ** 2).sum()))
            def own_vector(c): return (np.array([12 * np.log2(c['features']['f0'])] + [c['features'][k] for k in keys[1:]], float) - mean) / std if measured(c) else None
        if len(pool) < 8: return []
        judged = {}
        for r in curation.load_pairs(): judged.setdefault(frozenset((r['a'], r['b'])), []).append(r)
        rng = random.Random(session or 'koenami')
        order = list(range(len(pool))); rng.shuffle(order)
        pairs, used = [], set()
        def item(c): return dict(id=c['id'], display='自分' if c.get('private') else c.get('display_label'), text=c.get('text') or ('（自分の録音）' if c.get('private') else ''),
                                 audio=c['audio'], duration=c.get('duration'), speaker=c['speaker'])
        def add(a, b, kind, distance):
            if rng.random() < .5: a, b = b, a
            pairs.append({'a': item(a), 'b': item(b), 'kind': kind, 'distance': round(float(distance), 4), 'space': space})
        # Repeats: judged pairs from earlier sessions asked again once, oldest first, in their original order so a
        # changed answer is a changed judgement rather than a position effect. They keep the space they were drawn in.
        candidates = [rs[0] for key, rs in judged.items() if len(rs) == 1 and all(i in clips for i in key)
                      and rs[0].get('language', 'ja') == lang and (not session or rs[0].get('session') != session)]
        for r in candidates[:6]:
            pairs.append({'a': item(clips[r['a']]), 'b': item(clips[r['b']]), 'kind': 'repeat', 'distance': r.get('distance'), 'space': r.get('space') or 'acoustic-five'})
        # Own takes: each against a near library neighbour, and consecutive own takes against each other.
        own = [c for c in own_clips if lang == 'ja' and c.get('plotted')]
        rng.shuffle(own)
        for c in own:
            if len(pairs) >= 21: break
            v = own_vector(c)
            if v is None: continue
            d = dist(v); near = [j for j in np.argsort(d) if frozenset((c['id'], pool[j]['id'])) not in judged][:5]
            if not near: continue
            j = rng.choice(near); used.add(j); add(c, pool[j], 'near', d[j])
        own_pairs = 0
        for a, b in zip(own, own[1:]):
            if own_pairs >= 4: break
            va, vb = own_vector(a), own_vector(b)
            if va is None or vb is None or frozenset((a['id'], b['id'])) in judged: continue
            add(a, b, 'same-speaker', between(va, vb)); own_pairs += 1
        # Same speaker, the two library clips farthest apart in the space: always that speaker's most extreme
        # takes, a proxy for a deliberate change of delivery.
        by_speaker = {}
        for i, c in enumerate(pool): by_speaker.setdefault(c['speaker'], []).append(i)
        speakers = [s_ for s_, rows in by_speaker.items() if len(rows) >= 2]; rng.shuffle(speakers); library_pairs = 0
        for s_ in speakers:
            if library_pairs >= 6: break
            rows = by_speaker[s_]; block = X[rows]
            D = 1 - block @ block.T if index else np.sqrt(((block[:, None, :] - block[None, :, :]) ** 2).sum(-1))
            for flat in np.argsort(D, axis=None)[::-1]:
                a, b = divmod(int(flat), len(rows))
                if a == b: continue
                if frozenset((pool[rows[a]]['id'], pool[rows[b]]['id'])) in judged: continue
                used.update((rows[a], rows[b])); add(pool[rows[a]], pool[rows[b]], 'same-speaker', D[a, b]); library_pairs += 1; break
        for i in order:
            if len(pairs) >= 60: break
            d = dist(X[i])
            others = [j for j in np.argsort(d) if pool[j]['speaker'] != pool[i]['speaker'] and j not in used]
            if len(others) < 10: continue
            far = len(pairs) % 4 == 3
            j = rng.choice(others[len(others) // 2:]) if far else rng.choice(others[:5])
            if frozenset((pool[i]['id'], pool[j]['id'])) in judged or i in used: continue
            used.update((i, j)); add(pool[i], pool[j], 'far' if far else 'near', d[j])
        rng.shuffle(pairs)
        return pairs

    def label(cid):
        c = clips.get(cid)
        if not c: return cid
        return '自分' if c.get('private') else 'VOICEVOX' if c.get('synthetic') else (c.get('display_label') or c.get('name') or cid)

    async def pairs_get(request):
        if PUBLIC: raise web.HTTPNotFound()
        lang, session = request.query.get('lang', 'ja'), request.query.get('session', '')[:40]
        if lang not in libraries: raise web.HTTPNotFound()
        own_vectors = await own_timbre_vectors()
        return respond({'language': lang, 'questions': curation.PAIR_QUESTIONS, 'rubric': curation.PAIR_RUBRIC, 'judged': len(curation.load_pairs()),
                        'queue': pair_queue(lang, session, own_vectors), 'log': [dict(r, labels=[label(r['a']), label(r['b'])]) for r in curation.load_pairs()[-50:]]})

    async def pairs_post(request):
        if PUBLIC: raise web.HTTPNotFound()
        try: body = await request.json()
        except ValueError: raise web.HTTPBadRequest(text='JSON body required')
        if isinstance(body, dict):
            if body.get('language') not in libraries: raise web.HTTPUnprocessableEntity(text='unknown language')
            if any(body.get(k) not in clips for k in ('a', 'b')): raise web.HTTPUnprocessableEntity(text='unknown clip')
        try: record = curation.append_pair(body)
        except ValueError as error: raise web.HTTPUnprocessableEntity(text=str(error))
        return respond(record)

    async def review_get(request):
        if PUBLIC: raise web.HTTPNotFound()
        lang, mode, session = request.query.get('lang', 'ja'), request.query.get('mode', 'new'), request.query.get('session', '')[:40]
        if lang not in libraries or mode not in ('new', 'update'): raise web.HTTPNotFound()
        return respond({**review_queue(lang, mode, session), 'anchors': anchors(lang), 'flags': curation.PROBLEMS, 'offered': list(curation.QUALITY), 'scales': curation.SCALES, 'ageDecades': curation.AGE_DECADES, 'log': curation.load()[-200:]})

    async def review_post(request):
        if PUBLIC: raise web.HTTPNotFound()
        try: body = await request.json()
        except ValueError: raise web.HTTPBadRequest(text='JSON body required')
        if isinstance(body, dict) and body.get('language') not in libraries: raise web.HTTPUnprocessableEntity(text='unknown language')
        if isinstance(body, dict) and body.get('clip') and body['clip'] not in clips: raise web.HTTPUnprocessableEntity(text='unknown clip')
        try: record = curation.append(body)
        except ValueError as error: raise web.HTTPUnprocessableEntity(text=str(error))
        return respond(record)

    app.router.add_get('/api/review', review_get)
    app.router.add_get('/api/pairs', pairs_get)
    app.router.add_post('/api/pairs', pairs_post)
    app.router.add_post('/api/review', review_post)
    async def health(request):
        return respond({'ok': True})

    app.router.add_get('/api/health', health)
    app.router.add_post('/api/analyze', measurement)
    app.router.add_post('/api/age', age)
    app.router.add_post('/api/similar', similar)
    app.router.add_get('/api/catalog', catalog)
    app.router.add_get('/api/library', metadata)
    app.router.add_get('/api/detail/{name}', detail)
    app.router.add_get('/api/words/{name}', words)
    app.router.add_post('/api/words', words)
    app.router.add_get('/samples/{file}', sample)
    app.router.add_get('/data/{file}', data_file)
    return app


async def run(port):
    runner = web.AppRunner(create_app(), access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0' if PUBLIC else '127.0.0.1', port)
    await site.start()
    print(f'Koenami API: http://localhost:{port}', flush=True)
    try: await asyncio.Event().wait()
    finally: await runner.cleanup()


if __name__ == '__main__':
    libs = list((Path(sys.prefix) / 'lib').glob('python*/site-packages/nvidia/*/lib'))
    if libs and not os.environ.get('VOICE_CUDA_READY'):
        env = {**os.environ, 'VOICE_CUDA_READY': '1', 'LD_LIBRARY_PATH': ':'.join(map(str, libs)) + ':' + os.environ.get('LD_LIBRARY_PATH', '')}
        os.execve(sys.executable, [sys.executable, *sys.argv], env)
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=35511)
    options = parser.parse_args()
    logging.basicConfig(level=logging.CRITICAL)
    try: asyncio.run(run(options.port))
    except KeyboardInterrupt: pass
