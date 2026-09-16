import argparse
import asyncio
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

ROOT = Path(__file__).parent
PUBLIC = os.environ.get('KOENAMI_PUBLIC') == '1'
DATA = Path(os.environ.get('KOENAMI_DATA', ROOT / 'data'))
LIMIT = 60 if PUBLIC else 900
LANGUAGES = {'ja': '日本語', 'zh-CN': '普通话', 'en': 'English', 'ko': '한국어'}


def analyze(x):
    result = measure(x, detailed=True)
    result['visuals'] = visualise(x)
    return result


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
    gate, asr_gate = asyncio.Semaphore(1), asyncio.Semaphore(1)
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
        return respond({'capabilities': {'words': not PUBLIC, 'maxSeconds': LIMIT, 'review': not PUBLIC}, 'languages': [dict(id=k, label=v,
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

    def review_queue(lang):
        """One representative clip per unreviewed human speaker, female group first, longest plotted clip."""
        verdicts = curation.Verdicts()
        by_speaker = {}
        for c in libraries[lang]['clips']:
            if c.get('synthetic') or c.get('dataset') == 'JVS': continue
            by_speaker.setdefault(c['speaker'], []).append(c)
        queue = []
        for sid, clips in by_speaker.items():
            best = max(clips, key=lambda c: (bool(c.get('plotted')), c.get('duration', 0)))
            queue.append({'speaker': sid, 'group': best['group'], 'clips': [dict(id=c['id'], display=c.get('display_label'), text=c.get('text'),
                          audio=c['audio'], duration=c.get('duration')) for c in sorted(clips, key=lambda c: c['id'])], 'first': best['id']})
        queue.sort(key=lambda q: (q['group'] != 'female', q['clips'][0]['display'] or ''))
        reviewed = {r['speaker'] for r in verdicts.reviews if r.get('language', 'ja') == lang}
        queue = [q for q in queue if q['speaker'] not in reviewed]
        return {'language': lang, 'reviewed': len(reviewed), 'queue': queue}

    async def review_get(request):
        if PUBLIC: raise web.HTTPNotFound()
        lang = request.query.get('lang', 'ja')
        if lang not in libraries: raise web.HTTPNotFound()
        return respond({**review_queue(lang), 'flags': {'pronunciation': curation.PRONUNCIATION, 'quality': curation.QUALITY},
                        'ratings': list(curation.RATING_KEYS), 'ageDecades': curation.AGE_DECADES, 'log': curation.load()[-200:]})

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
    app.router.add_post('/api/review', review_post)
    async def health(request):
        return respond({'ok': True})

    app.router.add_get('/api/health', health)
    app.router.add_post('/api/analyze', measurement)
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
