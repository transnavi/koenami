//! Koenami's acoustic measurement on the Phonia crates.
//!
//! One function, [`measure`], turns mono 16 kHz samples into the numbers the
//! studio compares and plots: a pitch track, formants at two ceilings and
//! the ΔF resonance measure, cross-correlation harmonicity, a spectral
//! balance, and the pitch and quiet-interval statistics; [`visualise`] adds
//! the waveform, spectrum and spectrogram the dock draws. The same code runs
//! natively for the reference libraries and in the browser for a take, so
//! both sides of every comparison are measured alike.

use std::f64::consts::PI;

use base64::Engine;
use phx_audio::{Audio, ResampleQuality};
use phx_dsp::RealFftPlan;
use phx_formant::{FormantParams, FormantTrack, formant_track};
use phx_pitch::{PitchParams, pitch_track};
use phx_voice::{HarmonicityParams, HnrTrack, hnr_track_cc};
use serde::{Deserialize, Serialize};

/// Measurement standard. Every stored feature carries it; a change here
/// means every library and every saved take is re-measured. A library keeps
/// the version of the engine that built it until it is rebuilt.
pub const VERSION: &str = "4.0.1";
/// Analysis rate in hertz; every input is resampled to it.
pub const RATE: f64 = 16_000.0;
/// Frame step in seconds.
pub const STEP: f64 = 0.02;

/// The pitch analysis: Praat's autocorrelation with the Gaussian window,
/// `to_pitch_ac(time_step=0.02, pitch_floor=65, pitch_ceiling=500,
/// very_accurate=True, voicing_threshold=0.5)`. Every field is written out so
/// a change of defaults upstream cannot move the standard.
fn pitch_params() -> PitchParams {
    PitchParams {
        time_step: Some(STEP),
        floor_hz: 65.0,
        ceiling_hz: 500.0,
        max_candidates: 15,
        very_accurate: true,
        silence_threshold: 0.03,
        voicing_threshold: 0.5,
        octave_cost: 0.01,
        octave_jump_cost: 0.35,
        voiced_unvoiced_cost: 0.14,
    }
}

/// Burg formants at one ceiling, `to_formant_burg(time_step=0.02,
/// max_number_of_formants=5, maximum_formant=ceiling, window_length=0.025,
/// pre_emphasis_from=50)`; the same LPC settings for every input.
fn formant_params(ceiling_hz: f64) -> FormantParams {
    FormantParams {
        ceiling_hz,
        max_formants: 5,
        window_length: 0.025,
        time_step: Some(STEP),
        preemphasis_from_hz: 50.0,
    }
}

/// `to_harmonicity_cc(time_step=0.02, minimum_pitch=65,
/// silence_threshold=0.1, periods_per_window=4.5)`. The ceiling is not read
/// by the cross-correlation variant.
fn harmonicity_params() -> HarmonicityParams {
    HarmonicityParams {
        time_step: STEP,
        floor_hz: 65.0,
        ceiling_hz: 500.0,
        silence_threshold: 0.1,
        periods_per_window: 4.5,
    }
}

/// One row of the pitch track.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Row {
    pub t: f64,
    pub f0: Option<f64>,
    pub f1: Option<f64>,
    pub f2: Option<f64>,
    pub f3: Option<f64>,
    pub f4: Option<f64>,
    pub delta_f: Option<f64>,
    pub hnr: Option<f64>,
    pub balance: Option<f64>,
    pub pitch_span: Option<f64>,
}

/// A stretch of low energy longer than a quarter second.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct QuietInterval {
    pub start: f64,
    pub end: f64,
}

/// Summary features: medians over accepted voiced frames unless stated.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct Features {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f0: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f2: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f3: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f4: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hnr: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f3_alternative: Option<f64>,
    /// Mean formant spacing `mean(Fi / (i − ½))`, averaged over frames.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_f: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delta_f_alternative: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f0_mean: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_sd_hz: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_sd_st: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quiet_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quiet_mean: Option<f64>,
    /// Semitones between the 10th and 90th percentiles of F0.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_span: Option<f64>,
}

/// How much of the speech-level signal was voiced, and whether that is too
/// little for pitch, resonance and harmonicity medians to describe a voice.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Voicing {
    pub voiced_fraction: f64,
    pub sparse: bool,
}

/// Everything [`measure`] reports.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Measurement {
    pub version: String,
    pub duration: f64,
    pub voiced_seconds: f64,
    /// Seconds of speech-level frames: within 20 dB of the loudest 5 %.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voicing: Option<Voicing>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clipping_fraction: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level_dbfs: Option<f64>,
    pub features: Features,
    pub track: Vec<Row>,
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quiet_intervals: Option<Vec<QuietInterval>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formant_seconds: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_p10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_p90: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formant_sensitivity_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resonance_sensitivity_pct: Option<f64>,
    /// Share of voiced frames with energy at the even multiples of the tracked
    /// pitch and none at the odd ones: a track an octave low, or period-doubled
    /// creak, which looks the same.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_halving_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peak: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visuals: Option<Visuals>,
}

/// Mixes to mono and resamples to [`RATE`].
///
/// # Errors
///
/// Returns an error when the samples are not finite or the rate is invalid.
pub fn mono16(channels: Vec<Vec<f32>>, rate: f64) -> Result<Vec<f32>, String> {
    let audio = Audio::new(channels, rate).map_err(|e| e.to_string())?;
    mono16_audio(&audio)
}

/// [`mono16`] on decoded audio.
///
/// # Errors
///
/// Returns an error when the samples are not finite or resampling fails.
pub fn mono16_audio(audio: &Audio) -> Result<Vec<f32>, String> {
    let mono = audio.mono_mix().into_owned();
    if mono.iter().any(|s| !s.is_finite()) {
        return Err("Audio must contain finite samples.".to_string());
    }
    if audio.sample_rate() == RATE {
        return Ok(mono);
    }
    // Mix first: resampling is linear, and one channel costs one sinc pass.
    let resampled = Audio::new(vec![mono], audio.sample_rate())
        .map_err(|e| e.to_string())?
        .resampled(RATE, ResampleQuality::Best)
        .map_err(|e| e.to_string())?;
    Ok(resampled.mono_mix().into_owned())
}

/// Measures mono samples at [`RATE`].
///
/// `detailed` adds the running pitch span to every other track row and
/// keeps every second frame in the track instead of every fifth. A
/// non-finite sample yields a measurement whose `reason` says so, as the
/// Python engine rejects such input.
#[must_use]
pub fn measure(x: &[f32], detailed: bool) -> Measurement {
    let duration = x.len() as f64 / RATE;
    let mut result = Measurement {
        version: VERSION.to_string(),
        duration: round(duration, 3),
        voiced_seconds: 0.0,
        active_seconds: None,
        voicing: None,
        clipping_fraction: None,
        level_dbfs: None,
        features: Features::default(),
        track: Vec::new(),
        reason: None,
        quiet_intervals: None,
        formant_seconds: None,
        pitch_p10: None,
        pitch_p90: None,
        formant_sensitivity_pct: None,
        resonance_sensitivity_pct: None,
        pitch_halving_pct: None,
        peak: None,
        visuals: None,
    };
    if x.iter().any(|s| !s.is_finite()) {
        result.duration = duration;
        result.reason = Some("Audio must contain finite samples.".to_string());
        return result;
    }
    if duration < 0.25 {
        result.duration = duration;
        result.reason = Some("Speak for a little longer.".to_string());
        return result;
    }

    let audio = Audio::new(vec![x.to_vec()], RATE).expect("finite mono samples at a valid rate");
    let view = audio.slice_samples(0..audio.frames());
    let signal: Vec<f64> = x.iter().map(|&s| f64::from(s)).collect();

    let pitch = pitch_track(view.clone(), &pitch_params());
    let times: Vec<f64> = pitch.frames().iter().map(|f| f.time).collect();
    let f0: Vec<f64> = pitch.frames().iter().map(|f| f.f0.unwrap_or(0.0)).collect();
    let strength: Vec<f64> = pitch.frames().iter().map(|f| f.strength).collect();

    // 50 ms frames around each pitch time, clamped at the ends. `t · RATE`
    // truncates as Python's `int()` does; a frame centre one ulp either side
    // of a sample boundary can move a frame by one sample, an accepted source
    // of last-digit jitter against the Python engine.
    let frames: Vec<&[f64]> = times
        .iter()
        .map(|&t| {
            let mid = (t * RATE) as usize;
            let start = mid.saturating_sub(400);
            let end = (mid + 400).min(signal.len());
            &signal[start.min(end)..end]
        })
        .collect();
    let db: Vec<f64> = frames
        .iter()
        .map(|f| {
            let rms = (f.iter().map(|v| v * v).sum::<f64>() / f.len().max(1) as f64).sqrt();
            20.0 * (rms + 1e-12).log10()
        })
        .collect();
    let threshold = (quantile(&db, 0.95) - 35.0).max(-55.0);
    let voiced: Vec<bool> = (0..times.len())
        .map(|i| f0[i] > 0.0 && strength[i] >= 0.65 && db[i] > threshold)
        .collect();
    let count = voiced.iter().filter(|&&v| v).count();
    // Speech-level frames: within 20 dB of the loudest 5 %. A noisy microphone
    // floor can sit above the silence threshold, so the floor itself cannot be
    // the reference for "how much of the speech was voiced".
    let speech_level = threshold.max(quantile(&db, 0.95) - 20.0);
    let speech: Vec<bool> = db.iter().map(|&v| v > speech_level).collect();
    let active = speech.iter().filter(|&&s| s).count();

    result.voiced_seconds = round(count as f64 * STEP, 3);
    result.active_seconds = Some(round(active as f64 * STEP, 3));
    result.clipping_fraction =
        Some(signal.iter().filter(|v| v.abs() >= 0.999).count() as f64 / signal.len() as f64);
    let level = (signal.iter().map(|v| v * v).sum::<f64>() / signal.len() as f64).sqrt();
    result.level_dbfs = Some(20.0 * (level + 1e-12).log10());
    result.peak = Some(signal.iter().fold(0.0_f64, |m, v| m.max(v.abs())));

    // Low-energy intervals longer than 250 ms, distinct from unvoiced
    // consonants. They depend on level only, so they are reported whether or
    // not pitch can be measured.
    let mut intervals = Vec::new();
    let mut begin: Option<usize> = None;
    for j in 0..=db.len() {
        let quiet = j < db.len() && db[j] <= threshold;
        match (quiet, begin) {
            (true, None) => begin = Some(j),
            (false, Some(b)) => {
                if (j - b) as f64 * STEP >= 0.25 {
                    let last = (j - 1).min(times.len() - 1);
                    intervals.push(QuietInterval {
                        start: round((times[b] - STEP / 2.0).max(0.0), 3),
                        end: round((times[last] + STEP / 2.0).min(duration), 3),
                    });
                }
                begin = None;
            }
            _ => {}
        }
    }
    let quiet_total: f64 = intervals.iter().map(|p| p.end - p.start).sum();
    let quiet_mean = if intervals.is_empty() {
        0.0
    } else {
        quiet_total / intervals.len() as f64
    };
    result.quiet_intervals = Some(intervals);

    // Pitch, resonance and harmonicity are measured on voiced frames only.
    // Whispered or mostly unvoiced input can still pass a handful of frames
    // through the strength gate; those medians would describe noise, so they
    // are withheld when voicing is sparse.
    // The reported fraction counts voiced frames inside the speech-level
    // frames, so it stays within 0–1 when a quiet but periodic tail is voiced
    // without reaching speech level. The gate keeps comparing every reliable
    // voiced frame with the speech-level count: a loud non-speech burst (a
    // cough, handling noise) then shrinks neither the numerator nor the
    // verdict, which the intersection would.
    let voiced_in_speech = voiced
        .iter()
        .zip(&speech)
        .filter(|&(&v, &s)| v && s)
        .count();
    let sparse = count < 10 || (count as f64) < 0.1 * active as f64;
    result.voicing = Some(Voicing {
        voiced_fraction: round(voiced_in_speech as f64 / active.max(1) as f64, 3),
        sparse,
    });
    if sparse {
        result.reason =
            Some("No reliable voiced speech. Check the microphone and speak normally.".to_string());
        return result;
    }

    // Every input uses identical LPC settings. Re-estimate at a second
    // ceiling to expose sensitivity, rather than selecting a ceiling from a
    // gender label.
    let forms = [
        formant_track(view.clone(), &formant_params(5500.0)),
        formant_track(view.clone(), &formant_params(5000.0)),
    ];
    let hn = hnr_track_cc(view, &harmonicity_params());

    let mut data = Series::default();
    let mut track = Vec::new();
    let mut plan = RealFftPlan::new();
    let hann800 = hanning(800);
    let mut fft_in = vec![0.0; 2048];

    for (i, &t) in times.iter().enumerate() {
        let mut row = Row {
            t: round(t, 3),
            f0: None,
            f1: None,
            f2: None,
            f3: None,
            f4: None,
            delta_f: None,
            hnr: None,
            balance: None,
            pitch_span: None,
        };
        if voiced[i] {
            data.f0.push(f0[i]);
            row.f0 = Some(f0[i]);
            let ff: Vec<Option<f64>> = (1..=4).map(|j| formant_value(&forms[0], j, t)).collect();
            let bw: Vec<Option<f64>> = (1..=4)
                .map(|j| formant_bandwidth(&forms[0], j, t))
                .collect();
            let within = |v: Option<f64>, lo: f64, hi: f64| v.is_some_and(|v| v > lo && v < hi);
            let good = bw.iter().all(|&b| within(b, 0.0, 650.0))
                && within(ff[0], 150.0, 1200.0)
                && within(ff[1], 500.0, 3500.0)
                && within(ff[2], 1500.0, 4500.0)
                && within(ff[3], 2500.0, 5300.0);
            if good {
                let f: Vec<f64> = ff.iter().map(|v| v.unwrap()).collect();
                data.f1.push(f[0]);
                data.f2.push(f[1]);
                data.f3.push(f[2]);
                data.f4.push(f[3]);
                row.f1 = Some(f[0]);
                row.f2 = Some(f[1]);
                row.f3 = Some(f[2]);
                row.f4 = Some(f[3]);
                let delta = delta_f(&f);
                data.delta_f.push(delta);
                row.delta_f = Some(delta);
                if let Some(alt) = formant_value(&forms[1], 3, t) {
                    data.f3_alternative.push(alt);
                }
                let af: Vec<Option<f64>> =
                    (1..=4).map(|j| formant_value(&forms[1], j, t)).collect();
                if af.iter().all(Option::is_some) {
                    let af: Vec<f64> = af.iter().map(|v| v.unwrap()).collect();
                    data.delta_f_alternative.push(delta_f(&af));
                }
            }
            if let Some(hv) = harmonicity_value(&hn, t)
                && hv > -20.0
                && hv < 60.0
            {
                data.hnr.push(hv);
                row.hnr = Some(hv);
            }
            let frame = frames[i];
            let mean = frame.iter().sum::<f64>() / frame.len() as f64;
            fft_in.fill(0.0);
            let window = if frame.len() == 800 {
                &hann800
            } else {
                &hanning(frame.len())
            };
            for ((dst, &v), &w) in fft_in.iter_mut().zip(frame).zip(window) {
                *dst = (v - mean) * w;
            }
            let spectrum = plan.rfft(&mut fft_in);
            let hz_per_bin = RATE / 2048.0;
            let (mut lo, mut hi) = (0.0, 0.0);
            for (k, bin) in spectrum.iter().enumerate() {
                let freq = k as f64 * hz_per_bin;
                let power = bin.norm_sqr();
                if (100.0..1000.0).contains(&freq) {
                    lo += power;
                } else if (1000.0..4000.0).contains(&freq) {
                    hi += power;
                }
            }
            let balance = 10.0 * ((hi + 1e-20) / (lo + 1e-20)).log10();
            data.balance.push(balance);
            row.balance = Some(balance);
            // Octave check against the harmonic pattern: a voice tracked at half
            // its pitch has energy at the even multiples of the tracked value and
            // none at the odd ones. Voices above the 500 Hz ceiling (falsetto,
            // children) are tracked that way by design, and period-doubled creak
            // looks the same, so the share is reported, never corrected.
            // Calibration on JVS: modal reading at most 3.3 % of frames, halved
            // falsetto 20 % and up.
            let peak = |hz: f64| -> f64 {
                let half_width = (0.06 * hz).max(hz_per_bin);
                let first = ((hz - half_width) / hz_per_bin).ceil().max(0.0) as usize;
                let last =
                    (((hz + half_width) / hz_per_bin).floor() as usize).min(spectrum.len() - 1);
                let best = spectrum[first.min(last)..=last]
                    .iter()
                    .map(|bin| bin.norm_sqr())
                    .fold(0.0_f64, f64::max);
                10.0 * (best + 1e-20).log10()
            };
            let harmonics: Vec<f64> = (1..=6).map(|k| peak(k as f64 * f0[i])).collect();
            let odd = (harmonics[0] + harmonics[2] + harmonics[4]) / 3.0;
            let even = (harmonics[1] + harmonics[3] + harmonics[5]) / 3.0;
            data.halved.push(even - odd > 10.0);
            if detailed && i % 2 == 0 {
                let from = i.saturating_sub(74);
                let recent: Vec<f64> = (from..=i).filter(|&k| voiced[k]).map(|k| f0[k]).collect();
                if recent.len() >= 5 {
                    row.pitch_span =
                        Some(12.0 * (quantile(&recent, 0.9) / quantile(&recent, 0.1)).log2());
                }
            }
        }
        if i % (if detailed { 2 } else { 5 }) == 0 {
            track.push(row);
        }
    }

    let mut features = Features {
        f0: median(&data.f0),
        f1: median(&data.f1),
        f2: median(&data.f2),
        f3: median(&data.f3),
        f4: median(&data.f4),
        hnr: median(&data.hnr),
        balance: median(&data.balance),
        f3_alternative: median(&data.f3_alternative),
        // Adapt the DSFD formant-interval measure: mean over accepted voiced
        // frames. The paper uses CREPE voicing; this implementation uses
        // Praat's.
        delta_f: mean(&data.delta_f),
        delta_f_alternative: mean(&data.delta_f_alternative),
        f0_mean: mean(&data.f0),
        pitch_sd_hz: Some(std(&data.f0)),
        pitch_sd_st: Some(std(&data
            .f0
            .iter()
            .map(|f| 12.0 * f.log2())
            .collect::<Vec<_>>())),
        quiet_pct: None,
        quiet_mean: None,
        pitch_span: Some(12.0 * (quantile(&data.f0, 0.9) / quantile(&data.f0, 0.1)).log2()),
    };

    features.quiet_pct = Some(100.0 * quiet_total / duration);
    features.quiet_mean = Some(quiet_mean);

    result.pitch_halving_pct = Some(round(
        100.0 * data.halved.iter().filter(|&&h| h).count() as f64 / data.halved.len() as f64,
        1,
    ));
    result.formant_seconds = Some(round(data.f3.len() as f64 * STEP, 3));
    result.pitch_p10 = Some(quantile(&data.f0, 0.1));
    result.pitch_p90 = Some(quantile(&data.f0, 0.9));
    if let (Some(f3), Some(alt)) = (features.f3, features.f3_alternative) {
        result.formant_sensitivity_pct = Some(round(100.0 * (f3 / alt - 1.0).abs(), 1));
    }
    if let (Some(d), Some(alt)) = (features.delta_f, features.delta_f_alternative) {
        result.resonance_sensitivity_pct = Some(round(100.0 * (d / alt - 1.0).abs(), 1));
    }
    result.features = features;
    result.track = track;
    result
}

/// Per-frame series that the summary features are taken from.
#[derive(Default)]
struct Series {
    f0: Vec<f64>,
    f1: Vec<f64>,
    f2: Vec<f64>,
    f3: Vec<f64>,
    f4: Vec<f64>,
    hnr: Vec<f64>,
    balance: Vec<f64>,
    halved: Vec<bool>,
    f3_alternative: Vec<f64>,
    delta_f: Vec<f64>,
    delta_f_alternative: Vec<f64>,
}

/// `mean(Fi / (i − ½))` over F1–F4.
fn delta_f(f: &[f64]) -> f64 {
    (f[0] / 0.5 + f[1] / 1.5 + f[2] / 2.5 + f[3] / 3.5) / 4.0
}

/// Formant `slot` (1-based) at `time`, as Praat's `Formant: Get value at
/// time` reads it: linear interpolation between the two neighbouring frames,
/// or the nearest frame's value where a neighbour lacks the slot or the time
/// falls outside the interior of the grid; `None` where the nearest frame
/// lacks it. Frames are looked up by their own times.
fn formant_value(track: &FormantTrack, slot: usize, time: f64) -> Option<f64> {
    sampled_value(
        &track.frames,
        time,
        |f| f.time,
        |f| f.formants.get(slot - 1).map(|p| p.frequency),
    )
}

fn formant_bandwidth(track: &FormantTrack, slot: usize, time: f64) -> Option<f64> {
    sampled_value(
        &track.frames,
        time,
        |f| f.time,
        |f| f.formants.get(slot - 1).map(|p| p.bandwidth),
    )
}

/// The frames bracketing `time` (`left ≤ time`, `right = left + 1`) and the
/// position of `time` between them, from a search over the frame times.
fn bracket<T>(frames: &[T], time: f64, time_of: impl Fn(&T) -> f64) -> (isize, f64) {
    let right = frames.partition_point(|f| time_of(f) <= time);
    let left = right as isize - 1;
    let phase = if left < 0 {
        // Before the first frame: distance in steps, negative.
        let step = if frames.len() > 1 {
            time_of(&frames[1]) - time_of(&frames[0])
        } else {
            1.0
        };
        (time - time_of(&frames[0])) / step
    } else if right >= frames.len() {
        let step = if frames.len() > 1 {
            time_of(&frames[frames.len() - 1]) - time_of(&frames[frames.len() - 2])
        } else {
            1.0
        };
        (time - time_of(&frames[frames.len() - 1])) / step
    } else {
        let tl = time_of(&frames[left as usize]);
        (time - tl) / (time_of(&frames[right]) - tl)
    };
    (left, phase)
}

/// Linear interpolation on a frame grid with nearest-frame fallback.
fn sampled_value<T>(
    frames: &[T],
    time: f64,
    time_of: impl Fn(&T) -> f64,
    value_of: impl Fn(&T) -> Option<f64>,
) -> Option<f64> {
    if frames.is_empty() {
        return None;
    }
    let (left, phase) = bracket(frames, time, &time_of);
    let n = frames.len() as isize;
    let nearest = if phase >= 0.5 { left + 1 } else { left };
    let nearest = if left < 0 && phase < -0.5 || left + 1 >= n && phase > 0.5 {
        return None;
    } else {
        nearest.clamp(0, n - 1) as usize
    };
    let near = value_of(&frames[nearest])?;
    let right = left + 1;
    if left < 0 || right >= n {
        return Some(near);
    }
    let Some(fl) = value_of(&frames[left as usize]) else {
        return Some(near);
    };
    let Some(fr) = value_of(&frames[right as usize]) else {
        return Some(near);
    };
    Some((1.0 - phase) * fl + phase * fr)
}

/// HNR at `time` as Praat's `Harmonicity: Get value at time` reads it: cubic
/// interpolation over the frames, with unvoiced frames at −200 dB as Praat
/// stores them; the first or last frame's value within half a step outside
/// the frame centres, and `None` beyond that.
fn harmonicity_value(track: &HnrTrack, time: f64) -> Option<f64> {
    let frames = &track.frames;
    if frames.is_empty() {
        return None;
    }
    let value = |i: usize| frames[i].hnr_db.unwrap_or(-200.0);
    let n = frames.len();
    let (left, phase) = bracket(frames, time, |f| f.time);
    if left < 0 {
        return (phase >= -0.5).then(|| value(0));
    }
    let left = left as usize;
    if left + 1 >= n {
        return (phase <= 0.5).then(|| value(n - 1));
    }
    if phase == 0.0 {
        return Some(value(left));
    }
    let right = left + 1;
    if left == 0 || right == n - 1 {
        // A single neighbour on one side: linear.
        return Some((1.0 - phase) * value(left) + phase * value(right));
    }
    let (yl, yr) = (value(left), value(right));
    let dyl = 0.5 * (yr - value(left - 1));
    let dyr = 0.5 * (value(right + 1) - yl);
    let (fil, fir) = (phase, 1.0 - phase);
    Some(
        yl * fir + yr * fil
            - fil * fir * (0.5 * (dyr - dyl) + (fil - 0.5) * (dyl + dyr - 2.0 * (yr - yl))),
    )
}

/// `0.5 − 0.5·cos(2πn/(N−1))`, the symmetric Hann window.
fn hanning(n: usize) -> Vec<f64> {
    if n == 1 {
        return vec![1.0];
    }
    (0..n)
        .map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / (n - 1) as f64).cos())
        .collect()
}

/// `round(value, digits)` as Python rounds: the exact binary value, rounded
/// half to even at `digits` decimals. Formatting is correctly rounded, so the
/// text round trip is that operation without the error of scaling first.
fn round(value: f64, digits: usize) -> f64 {
    format!("{value:.digits$}")
        .parse()
        .expect("a formatted float parses")
}

/// Linear-interpolation quantile, as `numpy.quantile` by default.
fn quantile(values: &[f64], q: f64) -> f64 {
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let n = sorted.len();
    if n == 0 {
        return f64::NAN;
    }
    let position = q * (n - 1) as f64;
    let lower = position.floor() as usize;
    let upper = position.ceil() as usize;
    let fraction = position - lower as f64;
    sorted[lower] + (sorted[upper] - sorted[lower]) * fraction
}

fn median(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| quantile(values, 0.5))
}

fn mean(values: &[f64]) -> Option<f64> {
    (!values.is_empty()).then(|| values.iter().sum::<f64>() / values.len() as f64)
}

/// Population standard deviation, as `numpy.std`.
fn std(values: &[f64]) -> f64 {
    let m = values.iter().sum::<f64>() / values.len() as f64;
    (values.iter().map(|v| (v - m).powi(2)).sum::<f64>() / values.len() as f64).sqrt()
}

/// Waveform, spectrogram and spectrum at bounded resolution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Visuals {
    pub duration: f64,
    /// `[min, max]` per bucket, at most 1600 buckets.
    pub waveform: Vec<[f64; 2]>,
    pub spectrogram: Spectrogram,
    pub spectrum: Spectrum,
}

/// An 8-bit spectrogram image, frames × bins, row-major by frame.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Spectrogram {
    pub frames: usize,
    pub bins: usize,
    pub hop_seconds: f64,
    pub window_seconds: f64,
    pub max_hz: f64,
    pub range_db: f64,
    /// Base64 of `frames × bins` bytes.
    pub data: String,
}

/// Mean power spectrum in decibels below its peak.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Spectrum {
    pub hz_step: f64,
    pub db: Vec<f64>,
}

/// Bounded-resolution displays of `x` at [`RATE`].
#[must_use]
pub fn visualise(x: &[f32]) -> Option<Visuals> {
    if x.is_empty() {
        return None;
    }
    let n = x.len();
    let points = n.min(1600);
    // `linspace(0, n, points + 1)` truncated to integers, as the bucket
    // starts.
    let starts: Vec<usize> = (0..points)
        .map(|i| (i as f64 * n as f64 / points as f64) as usize)
        .collect();
    let waveform: Vec<[f64; 2]> = (0..points)
        .map(|i| {
            let end = if i + 1 < points { starts[i + 1] } else { n };
            let bucket = &x[starts[i]..end.max(starts[i] + 1)];
            let (lo, hi) = bucket
                .iter()
                .fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), &v| {
                    (lo.min(f64::from(v)), hi.max(f64::from(v)))
                });
            [round(lo, 5), round(hi, 5)]
        })
        .collect();

    let n_fft = 1024;
    let hop = (((n.saturating_sub(n_fft)) as f64 / 1400.0).ceil() as usize).max(160);
    let padded_len = n.max(n_fft);
    let frames = (padded_len - n_fft) / hop + 1;
    let bins = (5000.0 / (RATE / n_fft as f64)) as usize + 1;
    let window = hanning(n_fft);
    let mut plan = RealFftPlan::new();
    let mut buffer = vec![0.0; n_fft];
    let mut power = vec![0.0; frames * bins];
    for frame in 0..frames {
        let start = frame * hop;
        for (k, (dst, &w)) in buffer.iter_mut().zip(&window).enumerate() {
            *dst = x.get(start + k).map_or(0.0, |&v| f64::from(v)) * w;
        }
        let spectrum = plan.rfft(&mut buffer);
        for b in 0..bins {
            power[frame * bins + b] = spectrum[b].norm_sqr();
        }
    }
    let db: Vec<f64> = power.iter().map(|&p| 10.0 * p.max(1e-16).log10()).collect();
    let peak = db.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let image: Vec<u8> = db
        .iter()
        .map(|&v| ((v - peak + 80.0) / 80.0 * 255.0).clamp(0.0, 255.0) as u8)
        .collect();
    let mut spectrum: Vec<f64> = (0..bins)
        .map(|b| {
            let mean = (0..frames).map(|f| power[f * bins + b]).sum::<f64>() / frames as f64;
            10.0 * mean.max(1e-16).log10()
        })
        .collect();
    let top = spectrum.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    for v in &mut spectrum {
        *v = round(*v - top, 2);
    }
    Some(Visuals {
        duration: n as f64 / RATE,
        waveform,
        spectrogram: Spectrogram {
            frames,
            bins,
            hop_seconds: hop as f64 / RATE,
            window_seconds: n_fft as f64 / RATE,
            max_hz: 5000.0,
            range_db: 80.0,
            data: base64::engine::general_purpose::STANDARD.encode(&image),
        },
        spectrum: Spectrum {
            hz_step: RATE / n_fft as f64,
            db: spectrum,
        },
    })
}

/// [`measure`] with `detailed` on and [`visualise`] attached: what the
/// studio stores for a take.
#[must_use]
pub fn analyze(x: &[f32]) -> Measurement {
    let mut result = measure(x, true);
    result.visuals = visualise(x);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(f0: f64, seconds: f64) -> Vec<f32> {
        let n = (seconds * RATE) as usize;
        (0..n)
            .map(|i| {
                let t = i as f64 / RATE;
                // A pulse-like waveform with formant-ish resonances.
                (0.6 * (2.0 * PI * f0 * t).sin()
                    + 0.3 * (2.0 * PI * 2.0 * f0 * t).sin()
                    + 0.2 * (2.0 * PI * 3.0 * f0 * t).sin()
                    + 0.1 * (2.0 * PI * 5.0 * f0 * t).sin()) as f32
            })
            .collect()
    }

    #[test]
    fn short_input_asks_for_more() {
        let m = measure(&vec![0.0; 1000], false);
        assert_eq!(m.reason.as_deref(), Some("Speak for a little longer."));
        assert!(m.track.is_empty());
    }

    #[test]
    fn non_finite_samples_are_refused() {
        let mut x = vec![0.0_f32; 16_000];
        x[100] = f32::INFINITY;
        let m = measure(&x, false);
        assert_eq!(
            m.reason.as_deref(),
            Some("Audio must contain finite samples.")
        );
    }

    #[test]
    fn silence_has_no_voiced_speech() {
        let m = measure(&vec![0.0; 16_000], false);
        assert_eq!(m.voiced_seconds, 0.0);
        assert!(
            m.reason
                .as_deref()
                .unwrap()
                .starts_with("No reliable voiced speech")
        );
        assert_eq!(m.level_dbfs.map(|v| v < -200.0), Some(true));
    }

    #[test]
    fn harmonic_tone_measures_its_pitch() {
        let m = measure(&tone(180.0, 2.0), true);
        assert!(m.reason.is_none(), "{:?}", m.reason);
        let f0 = m.features.f0.unwrap();
        assert!((f0 - 180.0).abs() < 1.0, "{f0}");
        assert!(m.voiced_seconds > 1.5);
        assert!(m.features.pitch_span.unwrap() < 0.5);
        assert!(m.features.hnr.is_some());
        assert!(m.track.iter().any(|r| r.f0.is_some()));
        assert_eq!(m.version, VERSION);
    }

    #[test]
    fn voiced_fraction_stays_within_one_when_a_quiet_tail_is_voiced() {
        let mut x: Vec<f32> = tone(180.0, 3.0).iter().map(|v| v * 0.5).collect();
        let quiet = 10f32.powf(-26.0 / 20.0);
        for v in &mut x[16_000..] {
            *v *= quiet;
        }
        let m = measure(&x, false);
        let voicing = m.voicing.unwrap();
        assert!(
            voicing.voiced_fraction <= 1.0 && voicing.voiced_fraction > 0.9,
            "{}",
            voicing.voiced_fraction
        );
        assert!(!voicing.sparse);
        assert!(m.voiced_seconds > 2.0);
    }

    #[test]
    fn halving_share_flags_missing_odd_harmonics_of_the_tracked_pitch() {
        for f0 in [170.0, 340.0] {
            let m = measure(&tone(f0, 3.0), false);
            assert!((m.features.f0.unwrap() - f0).abs() < 2.0);
            assert!(
                m.pitch_halving_pct.unwrap() < 5.0,
                "{:?}",
                m.pitch_halving_pct
            );
        }
        // Alternating 300 ms blocks of 340 and 170 Hz: the path finder stays at
        // 170 Hz throughout, as Praat does, so the 340 Hz blocks lack odd
        // harmonics of the tracked value and about half the frames flag.
        let high = tone(340.0, 3.0);
        let low = tone(170.0, 3.0);
        let mixed: Vec<f32> = (0..high.len())
            .map(|i| if (i / 4800) % 2 == 1 { low[i] } else { high[i] })
            .collect();
        let m = measure(&mixed, false);
        assert!(m.features.f0.unwrap() < 200.0, "{:?}", m.features.f0);
        let pct = m.pitch_halving_pct.unwrap();
        assert!((35.0..=65.0).contains(&pct), "{pct}");
    }

    #[test]
    fn mono16_mixes_and_resamples() {
        assert!(mono16(vec![vec![0.0, f32::NAN]], 16_000.0).is_err());
        let stereo = mono16(vec![vec![0.5, 0.5], vec![-0.5, 0.1]], 16_000.0).unwrap();
        assert_eq!(stereo, vec![0.0, 0.3]);
        let long: Vec<f32> = (0..48_000)
            .map(|i| (2.0 * PI * 200.0 * i as f64 / 48_000.0).sin() as f32)
            .collect();
        let down = mono16(vec![long], 48_000.0).unwrap();
        assert!((down.len() as i64 - 16_000).abs() <= 2, "{}", down.len());
    }

    #[test]
    fn detailed_tracks_keep_every_second_row_with_a_running_span() {
        let x = tone(160.0, 1.5);
        let detailed = measure(&x, true);
        let coarse = measure(&x, false);
        assert!(detailed.track.len() > 2 * coarse.track.len());
        assert!(detailed.track.iter().any(|r| r.pitch_span.is_some()));
        assert!(coarse.track.iter().all(|r| r.pitch_span.is_none()));
        assert!(detailed.quiet_intervals.is_some() && detailed.peak.is_some());
    }

    #[test]
    fn interpolators_follow_praat_reads() {
        use phx_formant::{FormantFrame, FormantPoint};
        let point = |f: f64| FormantPoint {
            frequency: f,
            bandwidth: 100.0,
        };
        let frames = vec![
            FormantFrame {
                time: 0.1,
                formants: vec![point(500.0), point(1500.0)],
            },
            FormantFrame {
                time: 0.2,
                formants: vec![point(600.0)],
            },
            FormantFrame {
                time: 0.3,
                formants: vec![point(700.0), point(1700.0)],
            },
        ];
        let track = FormantTrack {
            frames,
            params: formant_params(5500.0),
            duration: 0.4,
            frame_grid: phx_dsp::FrameGrid::new(0.4, 0.05, 0.1),
        };
        assert_eq!(formant_value(&track, 1, 0.15), Some(550.0));
        // The slot is missing on one neighbour: the nearest frame decides.
        assert_eq!(formant_value(&track, 2, 0.13), Some(1500.0));
        assert_eq!(formant_value(&track, 2, 0.17), None);
        // Outside the interior: the nearest frame, or nothing past half a step.
        assert_eq!(formant_value(&track, 1, 0.06), Some(500.0));
        assert_eq!(formant_value(&track, 1, 0.04), None);

        let hnr = HnrTrack {
            frames: [
                (0.1, Some(10.0)),
                (0.2, Some(12.0)),
                (0.3, None),
                (0.4, Some(8.0)),
            ]
            .into_iter()
            .map(|(time, hnr_db)| phx_voice::HnrFrame {
                time,
                hnr_db,
                periodic_fraction: None,
            })
            .collect(),
            params: harmonicity_params(),
        };
        assert_eq!(harmonicity_value(&hnr, 0.2), Some(12.0));
        assert_eq!(harmonicity_value(&hnr, 0.15), Some(11.0));
        // Unvoiced frames count as −200 dB, so the cubic dives before them.
        assert!(harmonicity_value(&hnr, 0.25).unwrap() < -50.0);
        assert_eq!(harmonicity_value(&hnr, 0.06), Some(10.0));
        assert_eq!(harmonicity_value(&hnr, 0.04), None);
        assert_eq!(harmonicity_value(&hnr, 0.46), None);
    }

    #[test]
    fn rounding_matches_python() {
        // 1.4545 is stored just below its decimal value, so Python gives 1.454.
        assert_eq!(round(1.4545, 3), 1.454);
        assert_eq!(round(0.0465, 3), 0.046);
        assert_eq!(round(2.5, 0), 2.0);
        assert_eq!(round(0.125, 2), 0.12);
        assert_eq!(round(-0.0004, 3), -0.0);
    }

    #[test]
    fn quantile_matches_numpy_linear_interpolation() {
        let v = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(quantile(&v, 0.5), 2.5);
        assert!((quantile(&v, 0.9) - 3.7).abs() < 1e-12);
        assert_eq!(median(&[3.0, 1.0, 2.0]), Some(2.0));
        assert!((std(&[1.0, 2.0, 3.0, 4.0]) - 1.118_033_988_749_895).abs() < 1e-12);
    }

    #[test]
    fn visuals_have_the_documented_shape() {
        let v = visualise(&tone(150.0, 3.0)).unwrap();
        assert_eq!(v.waveform.len(), 1600);
        assert_eq!(v.spectrogram.bins, 321);
        assert!(v.spectrogram.frames <= 1401);
        assert_eq!(v.spectrum.db.len(), 321);
        assert!(v.spectrum.db.iter().all(|&d| d <= 0.0));
        assert!(v.spectrum.db.contains(&0.0));
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&v.spectrogram.data)
            .unwrap();
        assert_eq!(bytes.len(), v.spectrogram.frames * v.spectrogram.bins);
    }
}
