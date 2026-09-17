//! The browser's entry points: the same measurement, over JSON.
//!
//! The studio's worker calls these; every result is the JSON the studio
//! already reads from the analyzer, so the take and the references it is
//! compared with carry numbers from one implementation.

use wasm_bindgen::prelude::*;

use crate::{Measurement, RATE, VERSION, analyze, measure, mono16, visualise};

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

/// Measures one live window: [`analyze_json`] plus `active`, which says
/// whether the last half second carried voiced speech. The window is the
/// listener's last few seconds, so there is no length limit here; the caller
/// decides how much audio a tick carries.
#[wasm_bindgen]
#[must_use]
pub fn live_json(samples: &[f32]) -> String {
    let mut measurement = measure(samples, true);
    measurement.visuals = visualise(samples);
    let active = carries_speech(&measurement, samples.len());
    let mut value = serde_json::to_value(&measurement).expect("a measurement serialises");
    value["active"] = active.into();
    value.to_string()
}

/// Whether the end of a live window carried voiced speech: two voiced frames
/// in its last half second, the rule the live view shows 「音声を待っています…」
/// against.
fn carries_speech(measurement: &Measurement, samples: usize) -> bool {
    let end = samples as f64 / RATE;
    measurement
        .track
        .iter()
        .filter(|row| row.t > end - 0.5)
        .filter(|row| row.f0.is_some())
        .count()
        >= 2
}

/// Mixes interleaved samples at `rate` to mono 16 kHz, as the studio's
/// import path does before measuring; the error is the reason to show. The
/// channels are averaged in one pass, so a long import never holds a second
/// planar copy of itself.
#[wasm_bindgen]
pub fn to_mono16(samples: &[f32], channels: usize, rate: f64) -> Result<Vec<f32>, String> {
    if channels == 0 || !samples.len().is_multiple_of(channels) {
        return Err("Audio must contain whole frames.".into());
    }
    let mono: Vec<f32> = samples
        .chunks_exact(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();
    mono16(vec![mono], rate)
}

fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("a measurement serialises")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speech(seconds: f64) -> Vec<f32> {
        let n = (seconds * RATE) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / RATE;
                let phase = 2.0 * std::f64::consts::PI * 170.0 * t;
                (0.5 * phase.sin() + 0.25 * (2.0 * phase).sin() + 0.12 * (5.0 * phase).sin()) as f32
            })
            .collect()
    }

    #[test]
    fn a_window_that_ends_in_speech_is_active() {
        let value: serde_json::Value = serde_json::from_str(&live_json(&speech(1.5))).unwrap();
        assert_eq!(value["active"], serde_json::Value::Bool(true));
        // The live view draws the window from the same visuals the analyzer sent.
        assert!(value["visuals"]["spectrogram"]["frames"].as_u64().unwrap() > 0);
    }

    #[test]
    fn a_window_that_ends_in_silence_is_not() {
        let mut samples = speech(1.5);
        let from = samples.len() - (0.6 * RATE) as usize;
        samples[from..].fill(0.0);
        let value: serde_json::Value = serde_json::from_str(&live_json(&samples)).unwrap();
        assert_eq!(value["active"], serde_json::Value::Bool(false));
    }

    #[test]
    fn interleaved_channels_are_averaged_into_one() {
        let samples = [1.0, 0.0, 0.5, 0.5, 0.0, 1.0];
        assert_eq!(to_mono16(&samples, 2, RATE).unwrap(), vec![0.5, 0.5, 0.5]);
        assert!(to_mono16(&samples, 4, RATE).unwrap_err().contains("frames"));
        assert!(to_mono16(&samples, 0, RATE).unwrap_err().contains("frames"));
    }
}
