"""Compare the Rust measurement with the Python one on identical 16 kHz PCM.

Feeds each clip through `acoustics.measure` and through
`koenami-measure --pcm 16000` from the same resampled samples, so the table
shows the analysis difference alone; the resampler seam (SciPy's polyphase
filter against rubato's windowed sinc, which the Rust path uses on its own)
is excluded.

    .venv/bin/python measure/parity.py [--count N] [--seed S] [--files] [KEY...]

`--files` hands the FLAC files to the Rust CLI instead, so its own decoder
and resampler are in the comparison (the production path); the Python side
still decodes with soundfile and resamples with SciPy.

Keys are file names from `data/jvs-measurements.json`; without keys, N random
ones are drawn. Prints, per feature, the median, 90th percentile and maximum
difference (relative for frequencies, absolute for decibels, semitones and
percentages), then the top-level scalars and the track shape. Exits 1 when
the two sides disagree on which features exist or on the track grid.
"""

from __future__ import annotations

import argparse
import base64
import json
import random
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from acoustics import measure, mono16  # noqa: E402
from signals import visualise  # noqa: E402

ABSOLUTE = {"hnr", "balance", "pitch_span", "pitch_sd_st", "quiet_pct", "quiet_mean"}
FEATURES = [
    "f0", "f1", "f2", "f3", "f4", "hnr", "balance", "delta_f", "delta_f_alternative",
    "f3_alternative", "f0_mean", "pitch_sd_hz", "pitch_sd_st", "pitch_span",
    "quiet_pct", "quiet_mean",
]
SCALARS = [
    "duration", "voiced_seconds", "active_seconds", "clipping_fraction", "level_dbfs", "formant_seconds",
    "pitch_p10", "pitch_p90", "formant_sensitivity_pct", "resonance_sensitivity_pct", "pitch_halving_pct", "peak",
    "voicing.voiced_fraction",
]


def scalar(m: dict, key: str):
    """Top-level scalar, or a nested one written as `parent.child`."""
    for part in key.split("."):
        m = m.get(part) if isinstance(m, dict) else None
    return m


def difference(name: str, a: float, b: float) -> float:
    if name in ABSOLUTE or abs(a) < 1e-9:
        return abs(b - a)
    return abs(b - a) / abs(a)


def measure_both(binary: str, key: str, via_files: bool) -> tuple[dict, dict]:
    path = ROOT / "data/samples" / key
    x, sr = sf.read(path, dtype="float32")
    x16 = mono16(x, sr).astype("<f4")
    py = measure(x16, 16000, True)
    py["visuals"] = visualise(x16)
    if via_files:
        out = subprocess.run(
            [binary, "--detailed", "--visuals", str(path)], capture_output=True, check=True
        )
    else:
        out = subprocess.run(
            [binary, "--pcm", "16000", "--detailed", "--visuals"],
            input=x16.tobytes(), capture_output=True, check=True,
        )
    return py, json.loads(out.stdout)["measurement"]


def compare_visuals(py: dict, rs: dict) -> dict[str, float]:
    """Differences between the two `visualise` outputs, one number each."""
    a, b = py["visuals"], rs["visuals"]
    wave_a = np.array(a["waveform"])
    wave_b = np.array(b["waveform"])
    out = {"waveform buckets": float(len(wave_a) != len(wave_b))}
    if len(wave_a) == len(wave_b):
        out["waveform max |Δ|"] = float(np.abs(wave_a - wave_b).max())
    sa, sb = a["spectrogram"], b["spectrogram"]
    out["spectrogram shape"] = float((sa["frames"], sa["bins"], sa["hop_seconds"]) != (sb["frames"], sb["bins"], sb["hop_seconds"]))
    if not out["spectrogram shape"]:
        ia = np.frombuffer(base64.b64decode(sa["data"]), dtype=np.uint8).astype(int)
        ib = np.frombuffer(base64.b64decode(sb["data"]), dtype=np.uint8).astype(int)
        out["spectrogram pixels off by >1"] = float(np.mean(np.abs(ia - ib) > 1))
    out["spectrum max |Δ dB|"] = float(np.abs(np.array(a["spectrum"]["db"]) - np.array(b["spectrum"]["db"])).max())
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("keys", nargs="*")
    parser.add_argument("--count", type=int, default=120)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--binary", default=str(ROOT / "measure/target/release/koenami-measure"))
    parser.add_argument("--files", action="store_true", help="let the Rust CLI decode and resample the files itself")
    args = parser.parse_args()

    keys = args.keys
    if not keys:
        cache = json.loads((ROOT / "data/jvs-measurements.json").read_text())
        random.seed(args.seed)
        keys = random.sample(sorted(cache), args.count)

    with ThreadPoolExecutor() as pool:
        pairs = list(pool.map(lambda k: measure_both(args.binary, k, args.files), keys))

    feature_diffs: dict[str, list[float]] = {f: [] for f in FEATURES}
    scalar_diffs: dict[str, list[float]] = {s: [] for s in SCALARS}
    visual_diffs: dict[str, list[float]] = {}
    presence_mismatches = 0
    row_count_mismatches = 0
    voicing_flips = 0
    for py, rs in pairs:
        for f in FEATURES:
            a, b = py["features"].get(f), rs["features"].get(f)
            if a is None or b is None:
                presence_mismatches += (a is None) != (b is None)
                continue
            feature_diffs[f].append(difference(f, a, b))
        for s in SCALARS:
            a, b = scalar(py, s), scalar(rs, s)
            if a is None or b is None:
                presence_mismatches += (a is None) != (b is None)
                continue
            scalar_diffs[s].append(abs(b - a))
        # Row times are printed to the millisecond; a frame centre that sits
        # an ulp either side of a half-millisecond rounds differently on the
        # two sides (Praat forms the grid's first time in a different order),
        # so anything under a step apart is the same row.
        for name, value in compare_visuals(py, rs).items():
            visual_diffs.setdefault(name, []).append(value)
        if len(py["track"]) != len(rs["track"]) or any(
            abs(ra["t"] - rb["t"]) > 0.002 for ra, rb in zip(py["track"], rs["track"])
        ):
            row_count_mismatches += 1
        else:
            # A frame at the 0.65 strength gate or the energy threshold can
            # flip on a last-digit difference; counted, not gated.
            voicing_flips += sum(
                (ra["f0"] is None) != (rb["f0"] is None)
                for ra, rb in zip(py["track"], rs["track"])
            )

    rows = sum(len(py["track"]) for py, _ in pairs)
    print(f"{len(keys)} clips (seed {args.seed}); feature presence mismatches: "
          f"{presence_mismatches}; clips whose track grid differs: {row_count_mismatches}; "
          f"track rows whose voicing flips: {voicing_flips} of {rows}")
    print(f"{'feature':26s} {'median':>10s} {'p90':>10s} {'max':>10s}")
    for f in FEATURES:
        d = np.array(feature_diffs[f])
        if len(d):
            print(f"{f:26s} {np.median(d):10.2e} {np.quantile(d, .9):10.2e} {d.max():10.2e}")
    print("--- top-level scalars (absolute)")
    for s in SCALARS:
        d = np.array(scalar_diffs[s])
        if len(d):
            print(f"{s:26s} {np.median(d):10.2e} {np.quantile(d, .9):10.2e} {d.max():10.2e}")
    print("--- visuals (max over clips)")
    for name, values in visual_diffs.items():
        print(f"{name:26s} {max(values):10.2e}")
    return 1 if presence_mismatches or row_count_mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
