"""Collect adult Common Voice references with pinned audio and speaker metadata."""
import hashlib,json,tarfile,time
from pathlib import Path
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import requests
from engine import Cache

ROOT=Path(__file__).parent
REV='8262c16bf297c87a9cd88c51997c4758ed7a8ba2'
BASE=f'https://huggingface.co/datasets/fsicoli/common_voice_17_0/resolve/{REV}'
LANGS={'zh-CN':['test'],'en':['test'],'ko':['test','dev','train']}
ADULT={'twenties','thirties','forties','fourties','fifties','sixties','seventies','eighties','nineties'}

def eligible(row):
    return row.get('gender') in ['female','male','female_feminine','male_masculine'] and row.get('age') in ADULT and int(row.get('up_votes') or 0)>=2 and int(row.get('down_votes') or 0)==0

def collect_job(job):
    lang,split,rows=job
    wanted={Path(r['path']).name for r in rows}
    pending={n for n in wanted if not (ROOT/'data/samples'/n).exists()}
    if not pending:return
    url=f'{BASE}/audio/{lang}/{split}/{lang}_{split}_0.tar'
    for attempt in range(3):
        try:
            with requests.get(url,stream=True,timeout=(30,90)) as response:
                response.raise_for_status()
                with tarfile.open(fileobj=response.raw,mode='r|') as archive:
                    for member in archive:
                        name=Path(member.name).name
                        if member.isfile() and name in pending:
                            if not name.startswith('common_voice_') or not name.endswith('.mp3'):raise ValueError('Unexpected corpus filename')
                            blob=archive.extractfile(member).read()
                            if len(blob)<100:raise ValueError('Empty audio')
                            (ROOT/'data/samples'/name).write_bytes(blob);pending.remove(name)
                        if not pending:break
            print(f'{lang}/{split}: collected {len(wanted)-len(pending)}/{len(wanted)}',flush=True)
            if pending:raise RuntimeError(f'{len(pending)} audio files missing from archive')
            return
        except (requests.RequestException,tarfile.TarError,OSError) as error:
            if attempt==2:raise
            time.sleep(attempt+1)

def main():
    jobs=[];bylang={}
    for lang,splits in LANGS.items():
        allrows=[]
        for split in splits:
            rows=[r for r in json.loads((ROOT/'research'/f'cv17-{lang}-{split}.json').read_text()) if eligible(r)]
            jobs.append((lang,split,rows));allrows.extend(rows)
        bylang[lang]=allrows
        print(lang,'eligible:',len(allrows),'speakers:',len({r['client_id'] for r in allrows}),flush=True)
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(collect_job,jobs))
    outdir=ROOT/'data/libraries';outdir.mkdir(exist_ok=True)
    cache=Cache(ROOT/'data/multilingual-measurements.json')
    for lang,rows in bylang.items():
        clips=[];measured=cache.measure(ROOT/'data/samples',[Path(row['path']).name for row in rows])
        for row in rows:
            name=Path(row['path']).name;path=ROOT/'data/samples'/name
            m=measured[name];f=m['features'];reason=None
            if m['voiced_seconds']<1 or m.get('formant_seconds',0)<.35:reason='Too little stable voiced speech.'
            elif any(k not in f for k in ['f0','delta_f','hnr','balance']):reason='Incomplete measurements.'
            elif m.get('clipping_fraction',0)>.005:reason='Clipping.'
            elif m.get('resonance_sensitivity_pct',0)>12:reason='Unstable resonance tracking.'
            clip={'id':path.stem,'speaker':hashlib.sha256(row['client_id'].encode()).hexdigest()[:12],
                'group':'female' if row['gender'].startswith('female') else 'male','group_source':row['gender'],
                'language':lang,'age':row['age'],'text':row['sentence'],'audio':'/samples/'+name,
                'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak',1),
                'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),
                'tracking_sensitivity':m.get('resonance_sensitivity_pct'),'plotted':reason is None,'reason':reason,
                'source':f"{BASE}/audio/{lang}/{row['split']}/{lang}_{row['split']}_0.tar",'archive_member':name,
                'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
            clips.append(clip)
        counts={g:{'clips':sum(p['group']==g for p in clips),'speakers':len({p['speaker'] for p in clips if p['group']==g}),
            'plotted_clips':sum(p['group']==g and p['plotted'] for p in clips),'plotted_speakers':len({p['speaker'] for p in clips if p['group']==g and p['plotted']})} for g in ['female','male']}
        result={'version':cache.version,'language':lang,'source':f'Mozilla Common Voice 17.0 · {lang}','revision':REV,'license':'CC0-1.0',
            'source_url':'https://huggingface.co/datasets/fsicoli/common_voice_17_0','selection':'All adult female/male-labeled clips with at least two up-votes and no down-votes in the indicated splits.','splits':LANGS[lang],'counts':counts,'failures':[],'clips':clips}
        (outdir/f'{lang}.json').write_text(json.dumps(result,ensure_ascii=False))
        print(lang,'ready',json.dumps(counts),flush=True)

if __name__=='__main__':main()
