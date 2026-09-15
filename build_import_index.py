"""Metadata and original-file checksums for user-supplied JVS audio."""
import hashlib
import json
import zipfile
from pathlib import Path
from prepare_public import KEYS

ROOT = Path(__file__).parent


def main():
    source = json.loads((ROOT / 'data/native-ja.json').read_text())
    clips = []
    with zipfile.ZipFile(ROOT / 'research/jvs_ver1.zip') as archive:
        for clip in source['clips']:
            if clip.get('dataset') != 'JVS':
                continue
            info = archive.getinfo(clip['archive_member'])
            record = {k: v for k, v in clip.items() if k in KEYS and k not in {'audio', 'sha256'}}
            record.update(member=info.filename, bytes=info.file_size,
                          original_sha256=hashlib.sha256(archive.read(info)).hexdigest())
            clips.append(record)
    value = {'source': source['source_url'], 'metadata_license': 'CC BY-SA 4.0',
             'audio_terms': source['license'], 'clips': clips}
    (ROOT / 'data/jvs-import-index.json').write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    print(f'JVS import index: {len(clips)} files; metadata only.')


if __name__ == '__main__':
    main()
