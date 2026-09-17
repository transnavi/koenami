"""Assemble docs/research/jvs-similarity-results.json from the benchmark outputs.

Reads the JSON files the research scripts write under the benchmark output
directory (result.json, probe-*.json, deploy-check.json, halving-audit.json),
rounds every score to three decimals, writes null where a script recorded no
interval, and records what produced the numbers: the sha256 of every producing
script and of the analysis modules they import, so a reader verifies bytes
rather than history. Refuses to run while any of those files has uncommitted
changes, and refuses inputs that disagree on model revision, measurement
version or padding, so the tracked file never mixes runs.
"""
from pathlib import Path
import hashlib, json, subprocess
import numpy as np
import benchmark_jvs_similarity as bench

OUT = bench.OUT; DOC = bench.ROOT / 'docs/research/jvs-similarity-results.json'
PRODUCERS = ['benchmark_jvs_similarity.py', 'probe_jvs_similarity.py', 'extract_expanded_acoustics.py', 'research_jvs_deploy_check.py',
             'research_jvs_halving_audit.py', 'assemble_jvs_results.py', 'acoustics.py', 'perception.py', 'prepare_voice_models.py']
COMMANDS = [
    '.venv-embedding/bin/python benchmark_jvs_similarity.py extract',
    'KOENAMI_CUDA=1 .venv-embedding/bin/python benchmark_jvs_similarity.py checks',
    '.venv-embedding/bin/python benchmark_jvs_similarity.py evaluate',
    '.venv/bin/python extract_expanded_acoustics.py',
    '.venv-embedding/bin/python probe_jvs_similarity.py --seed 0 --repeats 2 --variants raw,standardized,learned,projected,learned_projected,learned_projected+aug --tag probe-seed0',
    '.venv-embedding/bin/python probe_jvs_similarity.py --seed 1 --repeats 2 --variants raw,standardized,learned,projected,learned_projected,learned_projected+aug --tag probe-seed1',
    'KOENAMI_CUDA=1 .venv-embedding/bin/python research_jvs_deploy_check.py --fp32',
    '.venv/bin/python research_jvs_halving_audit.py',
    '.venv-embedding/bin/python assemble_jvs_results.py',
]


def rounded(value, digits=3):
    if isinstance(value, dict): return {k: rounded(v, digits) for k, v in value.items()}
    if isinstance(value, list): return [rounded(v, digits) for v in value]
    if isinstance(value, float): return None if not np.isfinite(value) else round(value, digits)
    return value


def load(name):
    path = OUT / name
    if not path.is_file(): raise SystemExit(f'missing {path}; run the producing script first')
    return json.loads(path.read_text())


def provenance():
    dirty = subprocess.run(['git', 'status', '--porcelain', '--'] + PRODUCERS, capture_output=True, text=True, cwd=bench.ROOT).stdout.strip()
    if dirty: raise SystemExit('commit the producing scripts first:\n' + dirty)
    commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True, cwd=bench.ROOT).stdout.strip()
    return {'commit': commit, 'sha256': {name: hashlib.sha256((bench.ROOT / name).read_bytes()).hexdigest() for name in PRODUCERS}}


def consistent(raw, probes, deploy, audit):
    """Every input must describe the same models and measurement versions as result.json."""
    for name, other, keys in [('probe-seed0.json', probes['seed0'], ['sv_revision', 'acoustics_version', 'library_engine_version', 'padding']),
                              ('probe-seed1.json', probes['seed1'], ['sv_revision', 'acoustics_version', 'library_engine_version', 'padding']),
                              ('deploy-check.json', deploy, ['sv_revision']), ('halving-audit.json', audit, ['acoustics_version'])]:
        for key in keys:
            if other.get(key) != raw.get(key): raise SystemExit(f'{name} {key}={other.get(key)!r} disagrees with result.json {raw.get(key)!r}')


def main():
    raw = load('result.json'); probes = {s: load(f'probe-{s}.json') for s in ['seed0', 'seed1']}; deploy = load('deploy-check.json'); audit = load('halving-audit.json')
    consistent(raw, probes, deploy, audit); record = provenance(); commit = record['commit']
    layers = [f'sv_L{l:02d}_mean' for l in range(13)]
    out = {
        'commit': commit, 'producers_sha256': record['sha256'],
        'bootstrap_draws': {'raw_distance': 500, 'deployment': 1000, 'paired_raw_delta': 1000},
        'models': {'wavlm_sv': {'id': 'microsoft/wavlm-base-plus-sv', 'revision': raw['sv_revision']}, 'wavlm_base': {'id': raw['pretrained'][0], 'revision': raw['pretrained'][1]},
                   'checks': rounded(raw.get('checks'), 6)},
        'versions': {'acoustics': raw.get('acoustics_version'), 'library_engine': raw.get('library_engine_version'), 'timbre_descriptor': deploy.get('timbre_version'), 'xvector_descriptor': deploy.get('xvector_version')},
        'ratings': {'source': 'jvs_ver1/speaker_similarity_{female,male}.csv (JVS tags, CC BY-SA 4.0)', 'groups': raw['ratings'], 'scale': '-3..+3, ten listeners per pair'},
        'preprocessing': {'benchmark': raw.get('padding'), 'deployed': 'int8 ONNX graph from prepare_voice_models.py through perception.timbre; see the docstring there for the crop and pooling rule'},
        'raw_distance_vs_ratings': {c: {n: {g: rounded(raw['conditions'][c][g][n]) for g in ['female', 'male']} for n in ['acoustic_five', 'xvector'] + layers + [f'sv_L{l:02d}_meanstd' for l in range(13)]}
                                    for c in raw['conditions']},
        'sensitivity_ratios': {n: rounded(raw['sensitivity'][n]) for n in ['acoustic_five', 'xvector'] + layers},
        'extractor_coverage': rounded(raw['coverage']),
        'probes': {'protocol': probes['seed0']['protocol'], 'query_duration_s': rounded(probes['seed0'].get('nonpara_query_duration_s')),
                   **{s: {'variants': rounded(p['variants']), 'chosen': p['chosen'], 'sensitivity': rounded(p['sensitivity']), 'paired_raw_delta_vs_xvector': rounded(p['paired_raw_delta'])} for s, p in probes.items()}},
        'deployment': rounded({k: v for k, v in deploy.items()}),
        'pitch_audit': rounded({k: v for k, v in audit.items() if k != 'rows'}),
        'reproduction': COMMANDS,
    }
    DOC.parent.mkdir(parents=True, exist_ok=True); DOC.write_text(json.dumps(out, indent=1, ensure_ascii=False, allow_nan=False) + '\n'); print('wrote', DOC, DOC.stat().st_size, 'bytes')


if __name__ == '__main__': main()
