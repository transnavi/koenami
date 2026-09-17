"""Shared measurements for reference preparation, files, and live speech."""
import numpy as np
import parselmouth
from scipy.signal import resample_poly
from math import gcd

RATE = 16000
STEP = 0.02
VERSION = '3.2.0'


def interpolated_peak(x, k, half=8, steps=16):
    """Largest absolute value of the band-limited signal within a sample of the sampled maximum at k: a Hann-
    windowed sinc interpolant over the 17 samples around k, evaluated every 1/16 sample. The sampled maximum
    alone shifts with the sampling grid from cycle to cycle and reads as shimmer on a steady voice."""
    lo, hi = max(0, k - half), min(len(x), k + half + 1); idx = np.arange(lo, hi); best = abs(float(x[k]))
    for j in range(1 - steps, steps):
        d = k + j / steps - idx
        best = max(best, abs(float((x[lo:hi] * np.sinc(d) * (.5 + .5 * np.cos(np.pi * d / (half + 1)))).sum())))
    return best


def perturbation(x, pulses):
    """Local jitter and local shimmer from glottal pulse times, the Rust engine's definition: periods count
    between 0.1 and 20 ms; a pair of consecutive periods enters jitter when both count and their ratio stays
    under 1.3 (mean absolute difference over the mean of those periods); a pulse's amplitude is the band-limited
    peak (interpolated_peak) within half a period on either side, and a pair of consecutive amplitudes enters shimmer
    when the periods around them pass the jitter gate and the amplitude ratio stays under 1.6. None with
    fewer than two usable pairs."""
    periods = np.diff(pulses)
    usable = lambda t: 1e-4 <= t <= .02
    def amplitude(i):
        before = periods[i - 1] if i > 0 else periods[i]; after = periods[i] if i < len(periods) else periods[i - 1]
        start = max(0, int(round((pulses[i] - before / 2) * RATE))); end = min(len(x), int(round((pulses[i] + after / 2) * RATE)))
        if end <= start: return 0.
        return interpolated_peak(x, start + int(np.argmax(np.abs(x[start:end]))))
    pd, ps, ad, as_ = [], 0., [], 0.
    for i in range(1, len(periods)):
        a, b = periods[i - 1], periods[i]
        if not (usable(a) and usable(b)) or max(a / b, b / a) >= 1.3: continue
        pd.append(abs(a - b)); ps += a + b
        if i + 1 < len(periods) and usable(periods[i + 1]) and max(b / periods[i + 1], periods[i + 1] / b) < 1.3:
            u_, v = amplitude(i), amplitude(i + 1)
            if u_ > 0 and v > 0 and max(u_ / v, v / u_) < 1.6: ad.append(abs(u_ - v)); as_ += u_ + v
    ratio = lambda diffs, total: float(np.mean(diffs) / (total / (2 * len(diffs)))) if len(diffs) >= 2 else None
    return ratio(pd, ps), ratio(ad, as_)


def mono16(audio, rate):
    x = np.asarray(audio, dtype=np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    if x.ndim != 1 or not np.isfinite(x).all():
        raise ValueError('Audio must contain finite mono samples.')
    if rate != RATE:
        d = gcd(int(rate), RATE)
        x = resample_poly(x, RATE // d, int(rate) // d)
    return x


def measure(audio, rate=RATE, detailed=False):
    x = mono16(audio, rate)
    duration = len(x) / RATE
    if duration < 0.25:
        return {'version': VERSION, 'duration': duration, 'voiced_seconds': 0,
                'features': {}, 'track': [], 'reason': 'Speak for a little longer.'}
    sound = parselmouth.Sound(x, RATE)
    pitch = sound.to_pitch_ac(time_step=STEP, pitch_floor=65, pitch_ceiling=500,
                              very_accurate=True, voicing_threshold=0.5)
    f0 = pitch.selected_array['frequency']
    strength = pitch.selected_array['strength']
    times = pitch.xs()
    frames = []
    for t in times:
        mid = int(t * RATE)
        frame = x[max(0, mid-400):min(len(x), mid+400)]
        frames.append(frame)
    rms = np.array([np.sqrt(np.mean(f*f)) for f in frames])
    db = 20*np.log10(rms + 1e-12)
    threshold = max(-55., float(np.quantile(db, .95)) - 35.)
    voiced = (f0 > 0) & (strength >= .65) & (db > threshold)
    # Speech-level frames: within 20 dB of the loudest 5%. A noisy microphone floor can sit
    # above the silence threshold, so the floor itself cannot be the reference for "how much
    # of the speech was voiced".
    speech = db > max(threshold, float(np.quantile(db, .95)) - 20.)
    active = int(speech.sum())
    count = int(voiced.sum())
    base = {'version': VERSION, 'duration': round(duration, 3),
            'voiced_seconds': round(count * STEP, 3),
            'active_seconds': round(active * STEP, 3),
            'clipping_fraction': float(np.mean(np.abs(x) >= .999)),
            'level_dbfs': float(20*np.log10(np.sqrt(np.mean(x*x)) + 1e-12)),
            'peak': float(np.max(np.abs(x))),
            'features': {}, 'track': [], 'reason': None}
    # Low-energy intervals longer than 250 ms, distinct from unvoiced consonants. They depend
    # on level only, so they are reported whether or not pitch can be measured.
    quiet = db <= threshold
    intervals = []
    begin = None
    for j, value in enumerate(np.append(quiet, False)):
        if value and begin is None: begin = j
        elif not value and begin is not None:
            if (j-begin)*STEP >= .25:
                intervals.append({'start': round(max(0,float(times[begin])-STEP/2),3),
                                  'end': round(min(duration,float(times[min(j-1,len(times)-1)])+STEP/2),3)})
            begin = None
    base['quiet_intervals'] = intervals
    # Pitch, resonance and harmonicity are measured on voiced frames only. Whispered or
    # mostly unvoiced input can still pass a handful of frames through the strength gate;
    # those medians would describe noise, so they are withheld when voicing is sparse.
    # The reported fraction counts voiced frames inside the speech-level frames, so it stays within
    # 0–1 when a quiet but periodic tail is voiced without reaching speech level. The gate keeps
    # comparing every reliable voiced frame with the speech-level count: a loud non-speech burst
    # (a cough, handling noise) then shrinks neither the numerator nor the verdict, which the
    # intersection would.
    base['voicing'] = {'voiced_fraction': round(int((voiced & speech).sum()) / max(1, active), 3),
                       'sparse': count < 10 or count < .1 * active}
    if base['voicing']['sparse']:
        base['reason'] = 'No reliable voiced speech. Check the microphone and speak normally.'
        return base
    # Every input uses identical LPC settings. Re-estimate at a second ceiling
    # to expose sensitivity, rather than selecting a ceiling from a gender label.
    forms = [sound.to_formant_burg(time_step=STEP, max_number_of_formants=5,
              maximum_formant=c, window_length=.025, pre_emphasis_from=50)
              for c in [5500, 5000]]
    hn = sound.to_harmonicity_cc(time_step=STEP, minimum_pitch=65,
                                silence_threshold=.1, periods_per_window=4.5)
    data = {'f0': [], 'f1': [], 'f2': [], 'f3': [], 'f4': [], 'hnr': [],
            'balance': [], 'f3_alternative': [], 'delta_f': [], 'delta_f_alternative': [], 'h1h2': []}
    track = []
    halved = []
    for i, t in enumerate(times):
        row = {'t': round(float(t), 3), 'f0': None, 'f1': None, 'f2': None, 'f3': None, 'f4': None, 'delta_f': None, 'hnr': None, 'balance': None, 'pitch_span': None}
        if voiced[i]:
            data['f0'].append(f0[i])
            row['f0'] = float(f0[i])
            ff = [forms[0].get_value_at_time(j, t) for j in range(1,5)]
            bw = [forms[0].get_bandwidth_at_time(j, t) for j in range(1,5)]
            good = (all(np.isfinite(ff)) and 150 < ff[0] < 1200
                    and 500 < ff[1] < 3500 and 1500 < ff[2] < 4500
                    and 2500 < ff[3] < 5300 and all(0 < b < 650 for b in bw))
            if good:
                for k, val in zip(['f1','f2','f3','f4'], ff): data[k].append(val)
                row.update(f1=float(ff[0]), f2=float(ff[1]), f3=float(ff[2]), f4=float(ff[3]))
                delta=float(np.mean(np.array(ff)/np.array([.5,1.5,2.5,3.5])))
                data['delta_f'].append(delta);row['delta_f']=delta
                alt = forms[1].get_value_at_time(3, t)
                if np.isfinite(alt): data['f3_alternative'].append(alt)
                af=[forms[1].get_value_at_time(j,t) for j in range(1,5)]
                if all(np.isfinite(af)):
                    data['delta_f_alternative'].append(float(np.mean(np.array(af)/np.array([.5,1.5,2.5,3.5]))))
            hv = hn.get_value(t)
            if np.isfinite(hv) and -20 < hv < 60:
                data['hnr'].append(hv);row['hnr']=float(hv)
            f = frames[i] - np.mean(frames[i])
            spec = np.abs(np.fft.rfft(f * np.hanning(len(f)), n=2048))**2
            freq = np.fft.rfftfreq(2048, 1/RATE)
            lo = spec[(freq >= 100) & (freq < 1000)].sum()
            hi = spec[(freq >= 1000) & (freq < 4000)].sum()
            balance=float(10*np.log10((hi+1e-20)/(lo+1e-20)))
            data['balance'].append(balance);row['balance']=balance
            # Octave check against the harmonic pattern: a voice tracked at half its pitch has energy
            # at the even multiples of the tracked value and none at the odd ones. Voices above the
            # 500 Hz ceiling (falsetto, children) are tracked that way by design, and period-doubled
            # creak looks the same, so the share is reported, never corrected. Calibration on JVS:
            # modal reading at most 3.3% of frames, halved falsetto 20% and up.
            peak = lambda hz: float(10*np.log10(spec[np.abs(freq - hz) <= max(.06*hz, RATE/2048)].max() + 1e-20))
            harmonics = [peak(k*f0[i]) for k in range(1, 7)]
            halved.append(np.mean(harmonics[1::2]) - np.mean(harmonics[0::2]) > 10)
            # In a halved frame "H1" is the absent subharmonic: H1–H2 only where pitch and pattern agree.
            if not halved[-1]: data['h1h2'].append(harmonics[0] - harmonics[1])
            if detailed and i%2==0:
                recent=f0[max(0,i-74):i+1][voiced[max(0,i-74):i+1]]
                if len(recent)>=5:row['pitch_span']=float(12*np.log2(np.quantile(recent,.9)/np.quantile(recent,.1)))
        if i % (2 if detailed else 5) == 0: track.append(row)
    features = {k: float(np.median(v)) for k, v in data.items() if v}
    # Adapt the DSFD formant-interval measure: mean over accepted voiced
    # frames. The paper uses CREPE voicing; this implementation uses Praat.
    for key in ['delta_f','delta_f_alternative']:
        if data[key]:features[key]=float(np.mean(data[key]))
    features['f0_mean']=float(np.mean(data['f0']))
    features['pitch_sd_hz']=float(np.std(data['f0']))
    features['pitch_sd_st']=float(np.std(12*np.log2(np.array(data['f0']))))
    features['quiet_pct'] = 100*sum(p['end']-p['start'] for p in intervals)/duration
    features['quiet_mean'] = float(np.mean([p['end']-p['start'] for p in intervals])) if intervals else 0.
    features['pitch_span'] = float(12*np.log2(np.quantile(data['f0'], .9)/np.quantile(data['f0'], .1)))
    # Voice quality beyond the map's five: H1–H2 (median above), its spread across voiced frames and that of
    # formant spacing, harmonicity and balance, and pulse perturbation.
    for key in ['h1h2', 'delta_f', 'hnr', 'balance']:
        if data[key]: features[key + '_sd'] = float(np.std(data[key]))
    # Glottal pulses from the app's own pitch track, the operation the Rust engine's pulse search implements.
    points = parselmouth.praat.call([sound, pitch], 'To PointProcess (cc)')
    pulses = np.array(parselmouth.praat.call(points, 'To Matrix').values[0]) if parselmouth.praat.call(points, 'Get number of points') else np.array([])
    jitter, shimmer = perturbation(x, pulses)
    if jitter is not None: features['jitter'] = jitter
    if shimmer is not None: features['shimmer'] = shimmer
    base['pitch_halving_pct'] = round(100*float(np.mean(halved)), 1)
    base.update(features=features, track=track,
                formant_seconds=round(len(data['f3'])*STEP, 3),
                pitch_p10=float(np.quantile(data['f0'], .1)),
                pitch_p90=float(np.quantile(data['f0'], .9)))
    if 'f3_alternative' in features:
        base['formant_sensitivity_pct'] = round(100*abs(features['f3']/features['f3_alternative']-1), 1)
    if 'delta_f_alternative' in features:
        base['resonance_sensitivity_pct']=round(100*abs(features['delta_f']/features['delta_f_alternative']-1),1)
    return base
