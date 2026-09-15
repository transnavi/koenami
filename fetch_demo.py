"""Download the public demonstration collection for local development."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).parent
BASE = 'https://koe.transnavi.jp'


def fetch(path):
    with urlopen(BASE + path, timeout=60) as response:
        return response.read()


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def main():
    voices = []
    for lang in ('ja', 'zh-CN', 'en', 'ko'):
        library = json.loads(fetch('/api/library?lang=' + lang))
        for clip in library['clips']:
            path = ROOT / 'data/samples' / Path(clip['audio']).name
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                data = fetch(clip['audio'])
                if hashlib.sha256(data).hexdigest() != clip['sha256']:
                    raise ValueError('Sample checksum mismatch: ' + clip['id'])
                path.write_bytes(data)
        voices.extend(c for c in library['clips'] if c.get('synthetic'))
        library['clips'] = [c for c in library['clips'] if not c.get('synthetic')]
        save(ROOT / 'data' / ('native-ja.json' if lang == 'ja' else f'libraries/{lang}.json'), library)
        print(lang, len(library['clips']), 'human references', flush=True)
    save(ROOT / 'data/voicevox.json', {'clips': voices})
    save(ROOT / 'data/jvs-import-index.json', json.loads(fetch('/api/import-index/jvs')))
    print('Demo collection ready. Audio retains the source terms in each manifest.')


if __name__ == '__main__':
    main()
