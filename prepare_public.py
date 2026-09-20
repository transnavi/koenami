"""Build the explicit, redistributable demo file set. Never copy the data tree."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from collections import Counter

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


def jvs_publication(clips):
    """The 5,000 normal-speech references covered by Koenami's permission."""
    permission = json.loads((ROOT / 'curation/jvs-publication.json').read_text())
    result = [dict(c, license=permission['audio_license'], credit=permission['credit'])
              for c in clips if c.get('dataset') == 'JVS']
    if len(result) != permission['clips'] or len({c['id'] for c in result}) != len(result):
        raise ValueError('JVS publication requires exactly 5,000 distinct references')
    speakers = {f'jvs{i:03d}' for i in range(1, permission['speakers'] + 1)}
    counts = Counter()
    parallel = {f'VOICEACTRESS100_{n:03d}' for n in permission['parallel_sentences']}
    for clip in result:
        parts = clip.get('archive_member', '').split('/')
        if len(parts) != 5:
            raise ValueError(f"Invalid JVS source: {clip['id']}")
        corpus, speaker, subset, folder, filename = parts
        utterance = Path(filename).stem
        if (corpus != 'jvs_ver1' or speaker not in speakers or speaker != clip['speaker']
                or folder != 'wav24kHz16bit' or not filename.endswith('.wav')
                or clip.get('style') != 'normal reading'
                or subset not in {'parallel100', 'nonpara30'}
                or (subset == 'parallel100' and utterance not in parallel)
                or clip['id'] != f'{speaker}-{subset}-{utterance}'):
            raise ValueError(f"JVS reference outside the permitted selection: {clip['id']}")
        counts[speaker, subset] += 1
    expected = {(speaker, subset): count for speaker in speakers
                for subset, count in [('parallel100', len(parallel)),
                                      ('nonpara30', permission['nonparallel_per_speaker'])]}
    if counts != expected:
        raise ValueError('JVS publication requires 20 parallel and 30 nonparallel clips per speaker')
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
    jvs = jvs_publication(native)
    native = jvs + common_voice
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
    # No fallback SPA route may expose private baselines or local model files.
    assert not any('baseline' in p.name or p.name == 'x.wav' for p in OUT.rglob('*'))
    # The response headers come with the build: the root _headers file plus the adapter's
    # immutable-cache rules (the content security policy is in every page's meta tag).
    assert 'frame-ancestors' in (OUT / 'assets' / '_headers').read_text()
    print(json.dumps({'public_samples': len(manifest), 'jvs_clips': len(jvs), 'languages': catalog['languages'],
                      'audio_mb': round(sum((OUT / 'data' / 'samples' / c['file']).stat().st_size for c in manifest) / 1e6, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
