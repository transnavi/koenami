"""Build Japanese Common Voice references with documented pronunciation selection."""
import asyncio
import hashlib
import json
from collections import Counter
from pathlib import Path
from urllib.request import urlopen

from build_library import ADULT, BASE, REVISION, collect

ROOT = Path(__file__).parent
POLICY = json.loads((ROOT / 'curation/common-voice-ja.json').read_text())


def speaker_id(row):
    return hashlib.sha256(row['client_id'].encode()).hexdigest()[:12]


def selection(row, policy=POLICY):
    speaker = speaker_id(row)
    if speaker in policy['excluded_speakers'] or row.get('accent') in policy['excluded_accents']:
        return None
    if row.get('age') not in ADULT or row.get('gender') not in {'female_feminine', 'male_masculine'}:
        return None
    if row.get('up_votes', 0) < 2 or row.get('down_votes', 0) != 0:
        return None
    if speaker in policy['reviewed_speakers']:
        return 'reviewed_speaker'
    if row.get('accent') in policy['accepted_accents']:
        return 'declared_japanese_accent'
    return 'common_voice_validated'


def metadata():
    path = ROOT / 'research/common-voice-metadata.json'
    if path.exists():
        return json.loads(path.read_text())
    rows = []
    for i in range(4):
        split = f'ja_{i:02}'
        with urlopen(f'{BASE}/{split}/test.jsonl', timeout=60) as response:
            rows.extend({**json.loads(line), 'split': split} for line in response if line.strip())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, ensure_ascii=False))
    return rows


def main():
    # Praat's acoustic measurements are CPU-only; process one short clip at a time.
    import soundfile as sf
    from acoustics import measure

    rows = sorted((r for r in metadata() if selection(r)), key=lambda r: r['file_name'])
    failures = asyncio.run(collect(rows))
    if failures:
        raise RuntimeError(f'Could not collect {len(failures)} reference files; existing library retained.')
    clips = []
    cache_path = ROOT / 'data/library-measurements.json'
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    for row in rows:
        path = ROOT / 'data/samples' / row['file_name']
        measured = cache.get(path.name)
        if measured is None:
            audio, rate = sf.read(path)
            measured = measure(audio, rate)
            cache[path.name] = {k: v for k, v in measured.items() if k != 'track'}
        features = measured['features']
        reason = measured.get('reason')
        if measured.get('voiced_seconds', 0) < 1 or measured.get('formant_seconds', 0) < .35:
            reason = 'Too little stable voiced speech.'
        elif measured.get('clipping_fraction', 0) > .005:
            reason = 'Clipping.'
        elif measured.get('resonance_sensitivity_pct', 0) > 12:
            reason = 'Unstable resonance tracking.'
        elif not all(k in features for k in ('f0', 'delta_f', 'hnr', 'balance', 'pitch_span')):
            reason = 'Incomplete acoustic measurements.'
        sid = speaker_id(row)
        basis = selection(row)
        clip = {
            'id': path.stem, 'speaker': sid,
            'name': POLICY['reviewed_speakers'].get(sid, 'CV ' + sid[:6].upper()),
            'group': 'female' if row['gender'] == 'female_feminine' else 'male',
            'group_source': row['gender'], 'language': 'ja', 'dataset': 'Common Voice',
            'selection_basis': basis, 'text': row['text'], 'audio': '/samples/' + path.name,
            'duration': measured['duration'], 'features': features,
            'level_dbfs': measured.get('level_dbfs'), 'peak': measured.get('peak'),
            'voiced_seconds': measured.get('voiced_seconds'),
            'formant_seconds': measured.get('formant_seconds'),
            'tracking_sensitivity': measured.get('resonance_sensitivity_pct'),
            'plotted': reason is None, 'reason': reason,
            'source': f"{BASE}/{row['split']}/clips/{path.name}",
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'license': 'CC0-1.0',
        }
        if basis == 'reviewed_speaker':
            clip['native'] = True
            clip['native_source'] = 'Listening review of this speaker'
        elif basis == 'declared_japanese_accent':
            clip['accent'] = POLICY['accepted_accents'][row['accent']]
        clips.append(clip)
    manifest = {
        'language': 'ja', 'source': 'Common Voice 25.0 Japanese', 'revision': REVISION,
        'license': 'CC0-1.0', 'clips': clips,
        'selection': 'Adult speakers with at least two positive votes and no negative votes. '
                     'All eligible clips, excluding reviewed pronunciation mismatches and explicitly '
                     'self-reported non-native accents. Native pronunciation is unverified for other speakers.',
    }
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, allow_nan=False))
    (ROOT / 'data/common-voice-ja.json').write_text(json.dumps(manifest, ensure_ascii=False, allow_nan=False))
    # The local Japanese collection contains JVS plus these Common Voice references.
    path = ROOT / 'data/native-ja.json'
    library = json.loads(path.read_text()) if path.exists() else {'language': 'ja', 'clips': []}
    library['clips'] = [c for c in library['clips'] if c.get('dataset') != 'Common Voice'] + clips
    path.write_text(json.dumps(library, ensure_ascii=False, allow_nan=False))
    print(json.dumps({'clips': len(clips), 'speakers': len({c['speaker'] for c in clips}),
                      'selection': dict(Counter(c['selection_basis'] for c in clips)),
                      'plotted': sum(c['plotted'] for c in clips)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
