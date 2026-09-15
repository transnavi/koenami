"""Collect and measure all eligible adult Japanese reference recordings."""
import asyncio
import hashlib
import json
from pathlib import Path
from collections import Counter
import aiohttp
import numpy as np
import soundfile as sf
from acoustics import measure

ROOT=Path(__file__).parent
REVISION='365b7654cd582e20e8000921ef7b0e32caa1906a'
BASE=f'https://huggingface.co/datasets/FluidInference/cv-corpus-25.0-ja/resolve/{REVISION}'
SAMPLES=ROOT/'data/samples'
ADULT={'twenties','thirties','fourties','fifties','sixties','seventies','eighties'}


async def collect(rows):
    SAMPLES.mkdir(parents=True,exist_ok=True)
    semaphore=asyncio.Semaphore(8)
    done=0;failures=[]
    timeout=aiohttp.ClientTimeout(total=90)
    async with aiohttp.ClientSession(timeout=timeout,connector=aiohttp.TCPConnector(limit=8)) as session:
        async def one(row):
            nonlocal done
            dest=SAMPLES/row['file_name']
            if not dest.exists():
                async with semaphore:
                    for attempt in range(4):
                        try:
                            async with session.get(f"{BASE}/{row['split']}/clips/{row['file_name']}") as response:
                                response.raise_for_status();blob=await response.read()
                            if len(blob)<100:raise ValueError('Empty audio')
                            dest.write_bytes(blob);break
                        except (aiohttp.ClientError,asyncio.TimeoutError,ValueError) as error:
                            if attempt==3:failures.append({'file':row['file_name'],'error':type(error).__name__})
                            else:await asyncio.sleep(1+attempt*2)
            done+=1
            if done%100==0:print(f'Audio collected: {done}/{len(rows)}',flush=True)
        await asyncio.gather(*(one(row) for row in rows))
    return failures


def main():
    metadata=json.loads((ROOT/'research/common-voice-metadata.json').read_text())
    rows=[r for r in metadata if r['gender'] in ['female_feminine','male_masculine']
          and r['age'] in ADULT and r['up_votes']>=2 and r['down_votes']==0]
    rows.sort(key=lambda row:row['file_name'])
    print('Eligible audio:',len(rows),flush=True)
    failures=asyncio.run(collect(rows))
    clips=[];unplotted=[];cache=ROOT/'data/library-measurements.json'
    measured=json.loads(cache.read_text()) if cache.exists() else {}
    for i,row in enumerate(rows):
        path=SAMPLES/row['file_name']
        if not path.exists():continue
        if row['file_name'] not in measured:
            try:
                x,sr=sf.read(path);m=measure(x,sr)
                measured[row['file_name']]={k:v for k,v in m.items() if k!='track'}
            except (RuntimeError,ValueError):
                unplotted.append({'file':row['file_name'],'reason':'Audio could not be decoded.'});continue
        m=measured[row['file_name']];f=m['features']
        reason=None
        if m['voiced_seconds']<1 or m.get('formant_seconds',0)<.35:reason='Too little stable voiced speech.'
        elif any(k not in f for k in ['f0','delta_f','hnr','balance']):reason='Incomplete acoustic measurements.'
        elif m.get('clipping_fraction',0)>.005:reason='Clipping.'
        elif m.get('resonance_sensitivity_pct',0)>12:reason='Unstable resonance tracking.'
        sid=hashlib.sha256(row['client_id'].encode()).hexdigest()[:12]
        clip={'id':path.stem,'speaker':sid,'group':'female' if row['gender']=='female_feminine' else 'male',
              'group_source':row['gender'],'age':row['age'],'text':row['text'],
              'audio':'/samples/'+path.name,'duration':m['duration'],'features':f,
              'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak',1),
              'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),
              'tracking_sensitivity':m.get('resonance_sensitivity_pct'),
              'plotted':reason is None,'reason':reason,
              'source':f"{BASE}/{row['split']}/clips/{path.name}",
              'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
        clips.append(clip)
        if reason:unplotted.append({'file':row['file_name'],'reason':reason})
        if i%100==0:
            cache.write_text(json.dumps(measured,ensure_ascii=False));print(f'Audio measured: {i+1}/{len(rows)}',flush=True)
    cache.write_text(json.dumps(measured,ensure_ascii=False))
    plotted=[s for s in clips if s['plotted']]
    counts={g:{'clips':sum(s['group']==g for s in clips),
               'speakers':len({s['speaker'] for s in clips if s['group']==g}),
               'plotted_clips':sum(s['group']==g for s in plotted),
               'plotted_speakers':len({s['speaker'] for s in plotted if s['group']==g})} for g in ['female','male']}
    library={'version':2,'source':'Mozilla Common Voice 25.0 Japanese test set',
        'revision':REVISION,'license':'CC0-1.0',
        'source_url':'https://huggingface.co/datasets/FluidInference/cv-corpus-25.0-ja',
        'counts':counts,'age_bands':dict(Counter(s['age'] for s in clips)),
        'selection':'All adult female_feminine/male_masculine clips with at least two up-votes and zero down-votes. No selection based on acoustic pitch or on the practice recording.',
        'failures':failures,'unplotted':unplotted,'clips':clips}
    (ROOT/'data/library.json').write_text(json.dumps(library,ensure_ascii=False))
    print('Library ready:',json.dumps(counts),flush=True)


if __name__=='__main__':main()
