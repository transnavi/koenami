"""Build the explicit, redistributable demo file set. Never copy the data tree."""
import hashlib
import json
import shutil
from pathlib import Path
from statistics import median

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
    shutil.copytree(ROOT / 'dist', OUT / 'assets')
    models = ROOT / '.models/perception'
    if not all((models / (name + '.int8.onnx')).exists() for name in ['wavlm', 'age']):
        raise RuntimeError('Run prepare_voice_models.py before building the public demo.')
    (OUT / 'models').mkdir()
    for filename in ['wavlm.int8.onnx', 'age.int8.onnx', 'manifest.json', 'wavlm-README.md', 'wavlm-LICENSE', 'age-README.md', 'age-LICENSE', 'wavlm-preprocessor_config.json', 'age-preprocessor_config.json']:
        shutil.copy2(models / filename, OUT / 'models' / filename)
    write(OUT / 'assets' / 'public-api' / 'jvs-index.json', read('jvs-import-index.json'))
    write(OUT / 'data' / 'jvs-import-index.json', read('jvs-import-index.json'))
    libraries = {}
    native = read('native-ja.json')['clips']
    common_voice = read('common-voice-ja.json')['clips']
    excluded = set(json.loads((ROOT / 'curation/common-voice-ja.json').read_text())['excluded_speakers'])
    assert all(c['dataset'] == 'Common Voice' and c['license'] == 'CC0-1.0'
               and c.get('selection_basis') in {'reviewed_speaker', 'declared_japanese_accent', 'common_voice_validated'}
               and c['speaker'] not in excluded for c in common_voice)
    excluded_clips = set(json.loads((ROOT / 'curation/common-voice-ja.json').read_text()).get('excluded_clips', []))
    assert not any(c['id'] in excluded_clips for c in common_voice)
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
    catalog = {'capabilities': {'words': False, 'maxSeconds': 60, 'perception': True}, 'languages': [
        {'id': lang, 'label': label,
         'clips': sum(not c.get('synthetic') for c in libraries[lang]['clips']),
         'speakers': len({c['speaker'] for c in libraries[lang]['clips'] if not c.get('synthetic')}),
         'synthetic': sum(bool(c.get('synthetic')) for c in libraries[lang]['clips'])}
        for lang, label in LANGUAGES.items()]}
    write(OUT / 'assets' / 'public-api' / 'catalog.json', catalog)
    write(OUT / 'manifest.json', manifest)
    # No fallback SPA route may expose private baselines or local model files.
    assert not any('baseline' in p.name or p.name == 'x.wav' for p in OUT.rglob('*'))
    (OUT / 'assets' / '_headers').write_text("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: microphone=(self), camera=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
""")
    print(json.dumps({'public_samples': len(manifest), 'jvs_excerpt': 10, 'languages': catalog['languages'],
                      'audio_mb': round(sum((OUT / 'data' / 'samples' / c['file']).stat().st_size for c in manifest) / 1e6, 1)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
