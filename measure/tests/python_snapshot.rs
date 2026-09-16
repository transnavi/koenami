//! Compares the engine with a committed snapshot of `acoustics.measure` on
//! `data/original-excerpt.wav` (a 10 s, 44.1 kHz clip the Python tests use
//! too). The clip is not in the repository; the test is skipped when it is
//! absent. The bands are those recorded in the pull request that added the
//! crate, widened for this clip: it is decoded and resampled here (the
//! resampler seam), and a handful of frames change voicing, which the
//! pitch spread feels more than the median does.

use std::path::Path;

use koenami_measure::{measure, mono16_audio};
use phx_audio::Audio;

#[test]
fn matches_the_python_engine_on_the_excerpt() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let path = root.join("data/original-excerpt.wav");
    let Ok(bytes) = std::fs::read(&path) else {
        eprintln!("skipped: {} is absent", path.display());
        return;
    };
    let snapshot: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/original-excerpt.python.json")).unwrap();
    let audio = Audio::from_bytes(&bytes).unwrap();
    let x = mono16_audio(&audio).unwrap();
    let m = measure(&x, false);

    let want = |key: &str| {
        snapshot["features"][key]
            .as_f64()
            .unwrap_or_else(|| panic!("{key} is not in the snapshot"))
    };
    let relative = |key: &str, got: f64, band: f64| {
        let w = want(key);
        assert!(
            ((got - w) / w).abs() <= band,
            "{key}: {got} vs Python {w} (band {band})"
        );
    };
    let absolute = |key: &str, got: f64, band: f64| {
        let w = want(key);
        assert!(
            (got - w).abs() <= band,
            "{key}: {got} vs Python {w} (band {band})"
        );
    };
    assert_eq!(m.duration, snapshot["duration"].as_f64().unwrap());
    assert!((m.voiced_seconds - snapshot["voiced_seconds"].as_f64().unwrap()).abs() <= 0.04);
    let f = &m.features;
    // Recorded on 2026-09-17 with Phonia at d87a7ab (Praat's resampler in
    // front of the formant analysis): f0 −5·10⁻⁴, f0_mean −6·10⁻³,
    // pitch_sd_hz −3·10⁻², hnr −0.03 dB, balance −0.01 dB, delta_f −2·10⁻³,
    // f1 +7·10⁻⁵, f2 −9·10⁻³, f3 −2·10⁻³.
    relative("f0", f.f0.unwrap(), 2e-3);
    relative("f0_mean", f.f0_mean.unwrap(), 1e-2);
    relative("pitch_sd_hz", f.pitch_sd_hz.unwrap(), 5e-2);
    absolute("pitch_span", f.pitch_span.unwrap(), 0.2);
    absolute("hnr", f.hnr.unwrap(), 0.1);
    absolute("balance", f.balance.unwrap(), 0.05);
    absolute("quiet_pct", f.quiet_pct.unwrap(), 0.5);
    relative("delta_f", f.delta_f.unwrap(), 0.01);
    relative("f1", f.f1.unwrap(), 0.01);
    relative("f2", f.f2.unwrap(), 0.02);
    relative("f3", f.f3.unwrap(), 0.01);
    let level = snapshot["level_dbfs"].as_f64().unwrap();
    assert!(
        (m.level_dbfs.unwrap() - level).abs() <= 0.03,
        "level_dbfs vs {level}"
    );
}
