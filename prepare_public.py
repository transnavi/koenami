"""Build the explicit, redistributable demo file set. Never copy the data tree."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from statistics import median

from curation import Verdicts

ROOT = Path(__file__).parent
OUT = ROOT / '.deploy'
LANGUAGES = {'ja': '日本語', 'zh-CN': '普通话', 'en': 'English', 'ko': '한국어'}
KEYS = {'id', 'speaker', 'name', 'group', 'group_source', 'language', 'native',
        'native_source', 'dataset', 'style', 'text', 'audio', 'duration', 'features',
        'level_dbfs', 'peak', 'voiced_seconds', 'formant_seconds', 'tracking_sensitivity',
        'plotted', 'reason', 'source', 'sha256', 'license', 'synthetic', 'voice_label', 'credit',
        'selection_basis', 'accent', 'display_label'}


def read(name):
    return json.loads((ROOT / 'data' / name).read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False))


def jvs_excerpt(clips):
    # The author permits ~10 recordings on a webpage. This is a ten-file excerpt.
    result = []
    for group in ('female', 'male'):
        speakers = {}
        for clip in clips:
            if clip.get('dataset') == 'JVS' and clip['group'] == group and clip['plotted'] and 2 <= clip['duration'] <= 10:
                speakers.setdefault(clip['speaker'], []).append(clip)
        ordered = sorted(speakers.values(), key=lambda group: median(c['features']['f0'] for c in group))
        for q in (.1, .3, .5, .7, .9):
            group = ordered[round(q * (len(ordered) - 1))]
            target = median(c['features']['f0'] for c in group)
            result.append(min(group, key=lambda c: abs(c['features']['f0'] - target)))
    assert len(result) == len({c['id'] for c in result}) == 10
    return result


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    # The Kit build's asset tree; worker.ts is the deployed entry, not the adapter's worker,
    # and it serves nothing the adapter's own files describe (its routing table, the build's
    # version and environment files).
    shutil.copytree(ROOT / '.svelte-kit' / 'cloudflare', OUT / 'assets',
                    ignore=shutil.ignore_patterns('_worker.js', '_routes.json', 'version.json', 'env.js'))
    # The listening-review and pairs pages are local curation tools and the research
    # library is private; the public site never serves them.
    for name in ('review.html', 'pairs.html'):
        (OUT / 'assets' / name).unlink()
    shutil.rmtree(OUT / 'assets' / 'lab')
    write(OUT / 'assets' / 'public-api' / 'jvs-index.json', read('jvs-import-index.json'))
    write(OUT / 'data' / 'jvs-import-index.json', read('jvs-import-index.json'))
    libraries = {}
    native = read('native-ja.json')['clips']
    common_voice = read('common-voice-ja.json')['clips']
    verdicts = Verdicts()
    assert all(c['dataset'] == 'Common Voice' and c['license'] == 'CC0-1.0'
               and c.get('selection_basis') in {'reviewed_speaker', 'declared_japanese_accent', 'common_voice_validated'}
               and c['speaker'] not in verdicts.excluded_speakers for c in common_voice)
    assert not any(c['id'] in verdicts.excluded_clips for c in common_voice)
    native = jvs_excerpt(native) + common_voice
    assert len(native) == len({c['id'] for c in native})
    for lang in LANGUAGES:
        source = native if lang == 'ja' else read(f'libraries/{lang}.json')['clips']
        clips = [{k: v for k, v in c.items() if k in KEYS} for c in source]
        libraries[lang] = {'language': lang, 'clips': clips}
        write(OUT / 'data' / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json'), libraries[lang])
    voices = read('voicevox.json')
    write(OUT / 'data' / 'voicevox.json', voices)
    libraries['ja']['clips'].extend(voices['clips'])
    manifest = []
    for lang, library in libraries.items():
        write(OUT / 'assets' / 'public-api' / f'{lang}.json', library)
        for clip in library['clips']:
            name = Path(clip['audio']).name
            assert clip['audio'] == '/samples/' + name
            source = ROOT / 'data' / 'samples' / name
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            assert digest == clip['sha256'], name
            for folder in [OUT / 'data' / 'samples', OUT / 'assets' / 'samples']:
                folder.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, folder / name)
            manifest.append({'file': name, 'sha256': digest, 'dataset': clip.get('dataset', 'VOICEVOX' if clip.get('synthetic') else 'Common Voice')})
    catalog = {'capabilities': {'words': False, 'maxSeconds': 60, 'review': False}, 'languages': [
        {'id': lang, 'label': label,
         'clips': sum(not c.get('synthetic') for c in libraries[lang]['clips']),
         'speakers': len({c['speaker'] for c in libraries[lang]['clips'] if not c.get('synthetic')}),
         'synthetic': sum(bool(c.get('synthetic')) for c in libraries[lang]['clips'])}
        for lang, label in LANGUAGES.items()]}
    write(OUT / 'assets' / 'public-api' / 'catalog.json', catalog)
    # The age model rides in the container with its licence notice; WavLM stays local-only.
    models = ROOT / '.models' / 'perception'
    for name in ('age.int8.onnx', 'age-LICENSE', 'age-README.md', 'age-preprocessor_config.json', 'manifest.json'):
        assert (models / name).is_file(), f'{name} missing: run prepare_voice_models.py'
        (OUT / 'models').mkdir(exist_ok=True)
        shutil.copy2(models / name, OUT / 'models' / name)
    write(OUT / 'manifest.json', manifest)
    # Sitemap with last-modified dates taken from git, so a page's date only
    # moves when its source does.
    studio = ['src/lib/studio/head.html', 'src/lib/studio/body.html', 'src/lib/studio/app.ts', 'src/lib/i18n/index.ts']
    pages = {'/': [*studio, 'src/lib/i18n/ja.ts'], **{f'/{lang}/': [*studio, f'src/lib/i18n/{lang}.ts'] for lang in LANGUAGES if lang != 'ja'},
             **{f'/{name}.html': [f'src/lib/studio/{name}-head.html', f'src/lib/studio/{name}-body.html'] for name in ('guide', 'tutorial', 'method', 'references')}}
    entries = []
    for path, sources in pages.items():
        modified = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', *sources], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
        entries.append(f'<url><loc>https://koe.transnavi.jp{path}</loc>' + (f'<lastmod>{modified}</lastmod>' if modified else '') + '</url>')
    (OUT / 'assets' / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(entries) + '\n</urlset>\n')
    # Cloudflare Web Analytics injects its beacon into HTML at the edge; the CSP
    # admits that script and the endpoint it reports to.
    # No fallback SPA route may expose private baselines or local model files.
    assert not any('baseline' in p.name or p.name == 'x.wav' for p in OUT.rglob('*'))
    # The adapter's _headers marks the hashed files immutable; the site's own rules go first.
    (OUT / 'assets' / '_headers').write_text("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'
/service-worker.js
  Cache-Control: no-cache
""" + (ROOT / '.svelte-kit' / 'cloudflare' / '_headers').read_text())
    print(json.dumps({'public_samples': len(manifest), 'jvs_excerpt': 10, 'languages': catalog['languages'],
                      'audio_mb': round(sum((OUT / 'data' / 'samples' / c['file']).stat().st_size for c in manifest) / 1e6, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
