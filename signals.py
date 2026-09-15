"""Bounded-resolution waveform, spectrum, and spectrogram displays."""
import base64
import numpy as np
from acoustics import RATE


def visualise(x):
    x=np.asarray(x,dtype=np.float64)
    if not len(x):return None
    points=min(1600,len(x));starts=np.linspace(0,len(x),points+1,dtype=int)[:-1]
    waveform=np.column_stack([np.minimum.reduceat(x,starts),np.maximum.reduceat(x,starts)])
    n_fft=1024;hop=max(160,int(np.ceil(max(0,len(x)-n_fft)/1400)))
    padded=np.pad(x,(0,max(0,n_fft-len(x))))
    frames=np.lib.stride_tricks.sliding_window_view(padded,n_fft)[::hop]
    window=np.hanning(n_fft);power=np.abs(np.fft.rfft(frames*window,axis=1))**2
    bins=int(5000/(RATE/n_fft))+1;power=power[:,:bins]
    db=10*np.log10(np.maximum(power,1e-16));peak=float(db.max())
    image=np.clip((db-peak+80)/80*255,0,255).astype('uint8')
    spectrum=10*np.log10(np.maximum(power.mean(axis=0),1e-16));spectrum-=spectrum.max()
    return {'duration':len(x)/RATE,'waveform':np.round(waveform,5).tolist(),
        'spectrogram':{'frames':len(frames),'bins':bins,'hop_seconds':hop/RATE,'window_seconds':n_fft/RATE,'max_hz':5000,'range_db':80,
          'data':base64.b64encode(image.tobytes()).decode('ascii')},
        'spectrum':{'hz_step':RATE/n_fft,'db':np.round(spectrum,2).tolist()}}
