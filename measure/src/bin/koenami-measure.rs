//! Measures audio files or raw PCM and prints one JSON object per input.
//!
//! ```text
//! koenami-measure [--detailed] [--visuals] FILE...     one line per file: {"path", "measurement"}
//! koenami-measure [--detailed] [--visuals] --pcm RATE  32-bit float little-endian mono PCM on stdin
//! ```
//!
//! Files are WAV, AIFF or FLAC. Every input is mixed to mono and resampled to
//! 16 kHz before measurement. Files are measured in parallel; failures are
//! reported on the line for that file and the exit status is 1 when any
//! input failed.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::ExitCode;

use koenami_measure::{Measurement, measure, mono16, mono16_audio, visualise};
use phx_audio::Audio;
use rayon::prelude::*;
use serde::Serialize;

#[derive(Serialize)]
struct Line<'a> {
    path: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    measurement: Option<&'a Measurement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

struct Options {
    detailed: bool,
    visuals: bool,
    pcm_rate: Option<f64>,
    files: Vec<PathBuf>,
}

fn parse(args: impl Iterator<Item = String>) -> Result<Options, String> {
    let mut options = Options {
        detailed: false,
        visuals: false,
        pcm_rate: None,
        files: Vec::new(),
    };
    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--detailed" => options.detailed = true,
            "--visuals" => options.visuals = true,
            "--pcm" => {
                let rate = args.next().ok_or("--pcm needs a sample rate")?;
                let rate: f64 = rate.parse().map_err(|_| format!("bad rate {rate:?}"))?;
                if !rate.is_finite() || rate <= 0.0 {
                    return Err(format!("bad rate {rate}"));
                }
                options.pcm_rate = Some(rate);
            }
            "-h" | "--help" => return Err(String::new()),
            other if other.starts_with('-') => return Err(format!("unknown option {other}")),
            _ => options.files.push(PathBuf::from(arg)),
        }
    }
    if options.pcm_rate.is_none() && options.files.is_empty() {
        return Err("no input".to_string());
    }
    if options.pcm_rate.is_some() && !options.files.is_empty() {
        return Err("--pcm reads stdin; give no files with it".to_string());
    }
    Ok(options)
}

fn run(x: &[f32], options: &Options) -> Measurement {
    let mut m = measure(x, options.detailed);
    if options.visuals {
        m.visuals = visualise(x);
    }
    m
}

fn measure_file(path: &PathBuf, options: &Options) -> Result<Measurement, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let audio = Audio::from_bytes(&bytes).map_err(|e| e.to_string())?;
    let x = mono16_audio(&audio)?;
    Ok(run(&x, options))
}

/// Writes one line; a closed pipe ends the program quietly, any other
/// failure is reported.
fn emit(out: &mut impl Write, line: &Line<'_>) -> Result<(), ExitCode> {
    match writeln!(
        out,
        "{}",
        serde_json::to_string(line).expect("a measurement serialises")
    ) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::BrokenPipe => Err(ExitCode::SUCCESS),
        Err(e) => {
            eprintln!("error: writing output: {e}");
            Err(ExitCode::from(1))
        }
    }
}

fn main() -> ExitCode {
    const USAGE: &str = "usage: koenami-measure [--detailed] [--visuals] FILE...\n       koenami-measure [--detailed] [--visuals] --pcm RATE < samples.f32le";
    let options = match parse(std::env::args().skip(1)) {
        Ok(options) => options,
        Err(message) if message.is_empty() => {
            println!("{USAGE}");
            return ExitCode::SUCCESS;
        }
        Err(message) => {
            eprintln!("error: {message}\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let stdout = std::io::stdout();

    if let Some(rate) = options.pcm_rate {
        let mut bytes = Vec::new();
        if let Err(e) = std::io::stdin().read_to_end(&mut bytes) {
            eprintln!("error: reading stdin: {e}");
            return ExitCode::from(1);
        }
        let (chunks, rest) = bytes.as_chunks::<4>();
        if !rest.is_empty() {
            eprintln!(
                "error: stdin holds {} bytes, not a whole number of 32-bit samples",
                bytes.len()
            );
            return ExitCode::from(1);
        }
        let samples: Vec<f32> = chunks.iter().map(|&b| f32::from_le_bytes(b)).collect();
        let result = mono16(vec![samples], rate).map(|x| run(&x, &options));
        let line = match &result {
            Ok(m) => Line {
                path: "-",
                measurement: Some(m),
                error: None,
            },
            Err(e) => Line {
                path: "-",
                measurement: None,
                error: Some(e.clone()),
            },
        };
        let failed = line.error.is_some();
        if let Err(code) = emit(&mut stdout.lock(), &line) {
            return code;
        }
        return if failed {
            ExitCode::from(1)
        } else {
            ExitCode::SUCCESS
        };
    }

    let results: Vec<(String, Result<Measurement, String>)> = options
        .files
        .par_iter()
        .map(|path| {
            (
                path.to_string_lossy().into_owned(),
                measure_file(path, &options),
            )
        })
        .collect();
    let mut failed = false;
    let mut out = stdout.lock();
    for (path, result) in &results {
        let line = match result {
            Ok(m) => Line {
                path,
                measurement: Some(m),
                error: None,
            },
            Err(e) => {
                failed = true;
                Line {
                    path,
                    measurement: None,
                    error: Some(e.clone()),
                }
            }
        };
        if let Err(code) = emit(&mut out, &line) {
            return code;
        }
    }
    if failed {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}
