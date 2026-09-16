"""The measurement engine the reference libraries are built with.

`measure/` is the Rust engine; its CLI decodes each file, mixes it to mono,
resamples to 16 kHz and measures it, in parallel across files. The browser
runs the same crate, so a take and the references it is compared with are
measured by one implementation. Every result carries the engine's version,
and a cache entry from another version is measured again.
"""
import functools
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
BINARY = ROOT / 'measure/target/release/koenami-measure'
CHUNK = 500


class MeasureError(RuntimeError):
    """Files the engine could not measure; `measured` holds the ones it could."""

    def __init__(self, errors: dict[str, str], measured: dict[str, dict]):
        super().__init__('\n'.join(f'{path}: {reason}' for path, reason in errors.items()))
        self.errors = errors
        self.measured = measured


def _run(args):
    if not BINARY.exists():
        raise RuntimeError(f'{BINARY} is not built: run `cargo build --release` in measure/')
    return subprocess.run([str(BINARY), *args], capture_output=True, check=True, text=True)


@functools.cache
def version() -> str:
    """The measurement version the engine stamps on every result."""
    return _run(['--version']).stdout.strip()


def measure_files(paths, detailed=False) -> dict[str, dict]:
    """Measure every file; the result is keyed by the path as given.

    Every measurement carries the 0.1 s track; `detailed` makes it 0.04 s
    with the running pitch span, as the studio shows it. Files are handed
    to the engine a few hundred at a time. When the engine cannot measure a
    file, every file is still tried and a `MeasureError` naming each
    failure, and carrying the measurements that succeeded, is raised.
    """
    paths = [str(p) for p in dict.fromkeys(map(str, paths))]
    results, errors = {}, {}
    for start in range(0, len(paths), CHUNK):
        chunk = paths[start:start + CHUNK]
        run = subprocess.run([str(BINARY)] + (['--detailed'] if detailed else []) + chunk,
                             capture_output=True, text=True)
        for line in run.stdout.splitlines():
            row = json.loads(line)
            if 'error' in row:
                errors[row['path']] = row['error']
            else:
                results[row['path']] = row['measurement']
        if len(results) + len(errors) < start + len(chunk):
            raise RuntimeError(f'koenami-measure exited {run.returncode}: {run.stderr.strip()}')
    if errors:
        raise MeasureError(errors, results)
    return results


class Cache:
    """Measurements keyed by file name in one JSON file, held per engine version.

    `measure(root, names)` returns the measurement of every name, measuring
    the ones missing or stamped by another version and saving after every
    few hundred files, so an interrupted build resumes where it stopped and
    a file the engine rejects costs only its own retry. The saved file holds
    exactly the names asked for, at this version; the per-frame track and
    the quiet intervals are not kept.
    """

    def __init__(self, path: Path):
        self.path = path
        self.entries = json.loads(path.read_text()) if path.exists() else {}
        self.version = version()

    def measure(self, root: Path, names) -> dict[str, dict]:
        names = list(dict.fromkeys(names))
        stale = [n for n in names if self.entries.get(n, {}).get('version') != self.version]
        if stale:
            print(f'{self.path.name}: measuring {len(stale)} of {len(names)} files with engine {self.version}', flush=True)
        for start in range(0, len(stale), CHUNK):
            chunk = stale[start:start + CHUNK]
            try:
                measured = measure_files(root / n for n in chunk)
            except MeasureError as error:
                self._store(root, chunk, error.measured)
                self._save(names)
                raise
            self._store(root, chunk, measured)
            self._save(names)
            print(f'{self.path.name}: {min(start + CHUNK, len(stale))}/{len(stale)}', flush=True)
        return {n: self.entries[n] for n in names}

    def _store(self, root, names, measured):
        for n in names:
            m = measured.get(str(root / n))
            if m is None:
                continue
            m.pop('track', None)
            m.pop('quiet_intervals', None)
            self.entries[n] = m

    def _save(self, names):
        kept = {n: self.entries[n] for n in names if self.entries.get(n, {}).get('version') == self.version}
        self.entries = kept
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(kept, allow_nan=False))
        os.replace(tmp, self.path)
