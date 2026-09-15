"""Conservative speech-presence screen for the Japanese reference library.

Uses Silero VAD (MIT), pinned below. CUDA batch inference is supported; --cpu
is for machines without a CUDA runtime. This does not identify accents/speakers.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import onnxruntime as ort

ROOT = Path(__file__).parent
REVISION = '41f03a954b841327835dea1ddb7bb28ae23ddc2c'


def main(cpu=False):
    folder=ROOT/'.models/vad';folder.mkdir(parents=True,exist_ok=True)
    if not (folder/'model.onnx').exists():
        base=f'https://raw.githubusercontent.com/snakers4/silero-vad/{REVISION}/'
        for name,dest in [('src/silero_vad/data/silero_vad.onnx','model.onnx'),('LICENSE','LICENSE')]:
            (folder/dest).write_bytes(urlopen(base+name,timeout=60).read())
    providers=['CPUExecutionProvider']
    if not cpu:
        import torch
        ort.preload_dlls()
        if not torch.cuda.is_available() or 'CUDAExecutionProvider' not in ort.get_available_providers():
            raise RuntimeError('CUDA unavailable. Use --cpu for the CPU fallback.')
        providers.insert(0,'CUDAExecutionProvider')
    opts=ort.SessionOptions();opts.intra_op_num_threads=1;opts.inter_op_num_threads=1
    session=ort.InferenceSession(str(folder/'model.onnx'),providers=providers,sess_options=opts)
    library=json.loads((ROOT/'data/common-voice-ja.json').read_text())['clips']
    # Include specifically reviewed empty clips as controls even when excluded.
    policy=json.loads((ROOT/'curation/common-voice-ja.json').read_text())
    for row in policy.get('clip_reviews',[]):
        if not any(c['id']==row['clip'] for c in library):library.append({'id':row['clip'],'audio':'/samples/'+row['clip']+'.mp3'})
    path=ROOT/'data/speech-quality.json';cache=json.loads(path.read_text()) if path.exists() else {}
    pending=[]
    for clip in library:
        file=ROOT/'data/samples'/Path(clip['audio']).name;digest=hashlib.sha256(file.read_bytes()).hexdigest()
        saved=cache.get(clip['id'])
        if saved and saved.get('sha256')==digest and saved.get('revision')==REVISION:continue
        pending.append((clip,file,digest))
    for start in range(0,len(pending),32):
        group=pending[start:start+32];arrays=[]
        for clip,file,digest in group:
            x,sr=sf.read(file,dtype='float32')
            if x.ndim>1:x=x.mean(axis=1)
            if sr!=16000:x=resample_poly(x,16000,sr).astype(np.float32)
            peak=float(np.max(np.abs(x))) if len(x) else 0
            x=x*min(16,.2/max(peak,1e-8)) if peak<.2 else x
            arrays.append(x)
        length=max(len(x) for x in arrays);size=len(arrays)
        states=np.zeros((2,size,128),dtype=np.float32);context=np.zeros((size,64),dtype=np.float32)
        probabilities=[[] for _ in arrays]
        for offset in range(0,length,512):
            chunk=np.zeros((size,512),dtype=np.float32)
            for i,x in enumerate(arrays):
                part=x[offset:offset+512];chunk[i,:len(part)]=part
            inputs=np.concatenate([context,chunk],axis=1)
            outputs,states=session.run(None,{'input':inputs,'state':states,'sr':np.array(16000,dtype=np.int64)})
            context=chunk[:,-64:]
            for i,x in enumerate(arrays):
                if offset<len(x):probabilities[i].append(float(outputs[i,0]))
        for (clip,file,digest),prob in zip(group,probabilities):
            seconds=sum(p>=.5 for p in prob)*.032;peak=max(prob,default=0)
            cache[clip['id']]={'sha256':digest,'revision':REVISION,'speechSeconds':round(seconds,3),'peakProbability':round(peak,4),
                               'empty':seconds<.16 and peak<.2}
        path.write_text(json.dumps(cache,separators=(',',':')))
        print('Speech screened:',min(start+32,len(pending)),'/',len(pending),flush=True)
    rejected=[c['id'] for c in library if cache[c['id']]['empty']]
    print(json.dumps({'screened':len(library),'empty':rejected,'count':len(rejected)}),flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cpu',action='store_true');main(p.parse_args().cpu)
