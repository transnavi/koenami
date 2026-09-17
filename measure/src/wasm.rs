//! The browser's entry points: the same measurement, over JSON.
//!
//! The studio's worker calls these; every result is the JSON the studio
//! already reads from the analyzer, so the take and the references it is
//! compared with carry numbers from one implementation.

use wasm_bindgen::prelude::*;

use crate::{RATE, VERSION, analyze, measure, mono16};

/// The measurement version every result carries.
#[wasm_bindgen]
#[must_use]
pub fn version() -> String {
    VERSION.to_string()
}

/// Measures mono 16 kHz samples and returns what the studio stores for a
/// take: the measurement with its track, quiet intervals and visuals.
#[wasm_bindgen]
#[must_use]
pub fn analyze_json(samples: &[f32]) -> String {
    json(&analyze(samples))
}

/// Measures one live window: the same as [`analyze_json`] without the
/// visuals the live view redraws itself, plus `active`, which says whether
/// the last half second carried voiced speech.
#[wasm_bindgen]
#[must_use]
pub fn live_json(samples: &[f32]) -> String {
    let measurement = measure(samples, true);
    let end = samples.len() as f64 / RATE;
    let voiced = measurement
        .track
        .iter()
        .filter(|row| row.t > end - 0.5)
        .filter(|row| row.f0.is_some())
        .count();
    let mut value = serde_json::to_value(&measurement).expect("a measurement serialises");
    value["active"] = (voiced >= 2).into();
    value.to_string()
}

/// Mixes interleaved samples at `rate` to mono 16 kHz, as the studio's
/// import path does before measuring; the error is the reason to show.
#[wasm_bindgen]
pub fn to_mono16(samples: &[f32], channels: usize, rate: f64) -> Result<Vec<f32>, String> {
    if channels == 0 || !samples.len().is_multiple_of(channels) {
        return Err("Audio must contain whole frames.".into());
    }
    let planar = (0..channels)
        .map(|c| samples.iter().skip(c).step_by(channels).copied().collect())
        .collect();
    mono16(planar, rate)
}

fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("a measurement serialises")
}
