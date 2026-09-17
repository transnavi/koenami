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


def analyze(x):
    result = measure(x, detailed=True)
    result['visuals'] = visualise(x)
    return result


def load_timbre_index(data, version, known=None):
    """The timbre vectors build_timbre_index.py wrote for this descriptor version, arranged per language:
    unit vectors per clip, one centroid per speaker (the mean of the raw vectors, as in the benchmark,
    normalised once), and the clip rows of each speaker. Rows whose clip the app no longer serves are
    dropped. None when the file is absent, for another version, or empty."""
    path = data / f'timbre-index-{version}.npz'
    if not path.is_file(): return None
    raw = np.load(path, allow_pickle=False)
    if str(raw['version']) != version: return None
    ids, language, speaker, group, synthetic = (raw[k] for k in ['ids', 'language', 'speaker', 'group', 'synthetic'])
    keep = np.isin(ids, list(known)) if known is not None else np.ones(len(ids), bool)
    if raw['vectors'].ndim != 2 or not keep.any(): return None
    raw_vectors = raw['vectors'][keep].astype('float32'); ids, language, speaker, group, synthetic = ids[keep], language[keep], speaker[keep], group[keep], synthetic[keep]
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
    # Reference ranking needs a prepared WavLM graph that carries the timbre output, opened here so the
    # first request does not pay for it, and an index built for the same descriptor version.
    timbre_index = None
    if perception and perception.available(['wavlm']) and 'timbre_frames' in [o.name for o in perception.session('wavlm').get_outputs()]:
        timbre_index = load_timbre_index(DATA, perception.TIMBRE_VERSION, known=clips)
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
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: https://raw.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'"
        return response

    def respond(value, **kwargs):
        kwargs.setdefault('dumps', lambda v: json.dumps(v, allow_nan=False))
        return web.json_response(value, **kwargs)

    app = web.Application(client_max_size=RATE*4*LIMIT+1024, middlewares=[local_only])

    async def read_audio(request):
        body = await request.read()
        if not body or len(body) % 4 or not RATE <= len(body) <= RATE*4*LIMIT:
            raise web.HTTPBadRequest(text=f'0.25秒〜{LIMIT // 60}分の音声を使用してください。')
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
        if PUBLIC and request.query.get('live') == '1' and gate.locked(): raise web.HTTPServiceUnavailable(text='解析が混み合っています。少し待ってからお試しください。', headers={'Retry-After': '1'})
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
        if not perception.available(['age']): raise web.HTTPNotFound(text='年齢の推定モデルが用意されていません。')
        x = await read_audio(request)
        if len(x) > RATE * 60: raise web.HTTPBadRequest(text='1分以内の音声を使用してください。')
        async with neural_gate:
            try: return respond(await asyncio.to_thread(perception.age, x))
            except ValueError as error: raise web.HTTPUnprocessableEntity(text=str(error))

    async def similar(request):
        """Reference speakers whose voices sit closest to the recording, by the layer-3 timbre descriptor."""
        lang = request.query.get('lang', 'ja')
        if not timbre_index or lang not in timbre_index: raise web.HTTPNotFound(text='この言語の参照声のインデックスがありません。')
        try: limit = max(1, min(int(request.query.get('limit', '12')), 50))
        except (ValueError, TypeError): raise web.HTTPBadRequest(text='limit must be a number.')
        if PUBLIC and neural_gate.locked(): raise web.HTTPServiceUnavailable(text='解析が混み合っています。少し待ってからお試しください。', headers={'Retry-After': '2'})
        x = await read_audio(request)
        async with neural_gate:
            try: vector = await asyncio.to_thread(perception.timbre, x)
            except ValueError as e: raise web.HTTPUnprocessableEntity(text=str(e))
            except RuntimeError:
                logging.exception('timbre inference failed'); raise web.HTTPServiceUnavailable(text='声の比較に失敗しました。もう一度お試しください。')
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

    def pair_queue(lang, session=''):
        """Pairs of plotted human clips: mostly near neighbours in the standardized five-feature space, some far ones."""
        keys = ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span']
        pool = [c for c in libraries[lang]['clips'] if c.get('plotted') and not c.get('synthetic') and c.get('features')
                and all(isinstance(c['features'].get(k), (int, float)) for k in keys) and c['features']['f0'] > 0]
        if len(pool) < 8: return []
        X = np.array([[12 * np.log2(c['features']['f0'])] + [c['features'][k] for k in keys[1:]] for c in pool], float)
        judged = {frozenset((r['a'], r['b'])) for r in curation.load_pairs()}
        rng = random.Random(session or 'koenami')
        order = list(range(len(pool))); rng.shuffle(order)
        pairs, used = [], set()
        def item(c): return dict(id=c['id'], display='自分' if c.get('private') else c.get('display_label'), text=c.get('text') or ('（自分の録音）' if c.get('private') else ''),
                                 audio=c['audio'], duration=c.get('duration'), speaker=c['speaker'])
        def vector(c): return (np.array([12 * np.log2(c['features']['f0'])] + [c['features'][k] for k in keys[1:]], float) - mean) / std
        mean, std = X.mean(0), X.std(0) + 1e-9; X = (X - mean) / std
        # Own takes with usable measurements: each becomes one side of a pair against a near library neighbour.
        own = [c for c in own_clips if lang == 'ja' and c.get('plotted')]
        rng.shuffle(own)
        for c in own:
            if len(pairs) >= 15: break
            d = np.sqrt(((X - vector(c)) ** 2).sum(1))
            candidates = [j for j in np.argsort(d) if frozenset((c['id'], pool[j]['id'])) not in judged][:5]
            if not candidates: continue
            j = rng.choice(candidates); used.add(j)
            a, b = (c, pool[j]) if rng.random() < .5 else (pool[j], c)
            pairs.append({'a': item(a), 'b': item(b), 'kind': 'near', 'distance': round(float(d[j]), 4), 'own': True})
        for i in order:
            if len(pairs) >= 60: break
            d = np.sqrt(((X - X[i]) ** 2).sum(1))
            others = [j for j in np.argsort(d) if pool[j]['speaker'] != pool[i]['speaker'] and j not in used]
            if len(others) < 10: continue
            far = len(pairs) % 4 == 3
            j = rng.choice(others[len(others) // 2:]) if far else rng.choice(others[:5])
            key = frozenset((pool[i]['id'], pool[j]['id']))
            if key in judged or i in used: continue
            used.update((i, j))
            a, b = (pool[i], pool[j]) if rng.random() < .5 else (pool[j], pool[i])
            pairs.append({'a': item(a), 'b': item(b), 'kind': 'far' if far else 'near', 'distance': round(float(d[j]), 4)})
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
        return respond({'language': lang, 'questions': curation.PAIR_QUESTIONS, 'rubric': curation.PAIR_RUBRIC, 'judged': len(curation.load_pairs()),
                        'queue': pair_queue(lang, session), 'log': [dict(r, labels=[label(r['a']), label(r['b'])]) for r in curation.load_pairs()[-50:]]})

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
