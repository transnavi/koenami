"""Index public research demonstrations; playback links to the authors' files."""
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests
import soundfile as sf
from acoustics import measure

ROOT=Path(__file__).parent
REPOS=['DisentangledSourceFilterDataset','VersatileVoiceDataset']


def main():
    jobs=[]
    for repo in REPOS:
        response=requests.get(f'https://api.github.com/repos/berkeley-speech-group/{repo}/git/trees/main?recursive=1',timeout=30)
        response.raise_for_status();tree=response.json();revision=tree['sha']
        for item in tree['tree']:
            path=item['path']
            if path.endswith('.wav'):
                jobs.append({'repo':repo,'revision':revision,'path':path,
                             'url':f'https://raw.githubusercontent.com/berkeley-speech-group/{repo}/{revision}/{path}'})
    def fetch(job):
        r=requests.get(job['url'],timeout=40);r.raise_for_status();return job,r.content
    clips=[]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for i,(job,blob) in enumerate(pool.map(fetch,jobs)):
            audio,rate=sf.read(io.BytesIO(blob));m=measure(audio,rate)
            parts=job['path'].split('/');config=parts[-2];utterance=Path(parts[-1]).stem
            speaker=parts[-3] if job['repo']=='VersatileVoiceDataset' else 'DSFD'
            levels=config.split('-')
            text={'key':'The blue spot is on the key again.','hit':'How hard did he hit him?',
                  'sent_1':'This was easy for us.','sent_2':'Is this seesaw safe?','aa':'Sustained /a/'}.get(utterance,utterance)
            plotted=m['voiced_seconds']>=.15 and m.get('formant_seconds',0)>=.1 and 'delta_f' in m['features']
            reason=None if plotted else 'Too little stable resonance in this demonstration.'
            if m.get('resonance_sensitivity_pct',0)>12:plotted=False;reason='Unstable resonance tracking.'
            if m.get('clipping_fraction',0)>.005:plotted=False;reason='Clipping in this recording.'
            clips.append({'id':'research-'+hashlib.sha256(job['path'].encode()).hexdigest()[:12],
                'speaker':speaker,'group':'research','dataset':'VVD' if job['repo']=='VersatileVoiceDataset' else 'DSFD',
                'configuration':{'pitch':levels[0],'resonance':levels[1],'weight':levels[2]},
                'text':text,'utterance':utterance,'audio':job['url'],'source':f"https://berkeley-speech-group.github.io/{job['repo']}/",
                'duration':m['duration'],'features':m['features'],'plotted':plotted,
                'reason':reason,'formant_seconds':m.get('formant_seconds',0),'clipping_fraction':m.get('clipping_fraction',0),
                'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak',1),
                'voiced_seconds':m['voiced_seconds'],'tracking_sensitivity':m.get('resonance_sensitivity_pct'),
                'revision':job['revision']})
            if i%20==0:print(f'Research demonstrations: {i+1}/{len(jobs)}',flush=True)
    output={'version':2,'clips':clips,'playback':'Research audio streams from the authors’ public repositories. It is not rehosted in this package.',
            'interpretation':'Configuration labels are supplied by the researchers. They are not inferred from the audio. No listener score is transferred to the practice voice.'}
    (ROOT/'data/research-demos.json').write_text(json.dumps(output,ensure_ascii=False))
    print('Research demonstrations ready:',len(clips),flush=True)


if __name__=='__main__':main()
