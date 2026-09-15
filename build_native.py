"""Personal-use native Japanese references from the official JVS archive."""
import io,json,hashlib,zipfile,time
from pathlib import Path
import soundfile as sf
from acoustics import measure,VERSION
ROOT=Path(__file__).parent
SOURCE='https://sites.google.com/site/shinnosuketakamichi/research-topics/jvs_corpus'
PAPER='https://arxiv.org/abs/1908.06248'
PARALLEL={3,4,7,10,11,12,25,30,33,35,36,47,52,58,64,67,75,80,86,92}
z=zipfile.ZipFile(ROOT/'research/jvs_ver1.zip');members=set(z.namelist())
genders={r.split()[0]:r.split()[1] for r in z.read('jvs_ver1/gender_f0range.txt').decode().splitlines()[1:] if r.strip()}
cachepath=ROOT/'data/jvs-measurements.json';cache=json.loads(cachepath.read_text()) if cachepath.exists() else {}
clips=[];start=time.time()
for speaker,gender in genders.items():
 for style in ['parallel100','nonpara30']:
  prefix=f'jvs_ver1/{speaker}/{style}'
  lines=z.read(prefix+'/transcripts_utf8.txt').decode().splitlines()
  for line in lines:
   key,text=line.split(':',1)
   if style=='parallel100' and int(key.rsplit('_',1)[1]) not in PARALLEL:continue
   name=f'{speaker}-{style}-{key}';dest=ROOT/'data/samples'/f'{name}.flac';member=prefix+'/wav24kHz16bit/'+key+'.wav'
   if member not in members:continue
   if not dest.exists():
    x,sr=sf.read(io.BytesIO(z.read(member)),dtype='float32');sf.write(dest,x,sr,format='FLAC',subtype='PCM_16')
   if name not in cache or cache[name]['version']!=VERSION:
    x,sr=sf.read(dest,dtype='float32');m=measure(x,sr);m.pop('track',None);m.pop('quiet_intervals',None);cache[name]=m
   m=cache[name];f=m['features'];reason=None
   if m['voiced_seconds']<1:reason='Too little voiced speech.'
   elif m.get('formant_seconds',0)<.35:reason='Too little stable resonance.'
   elif m.get('clipping_fraction',0)>.005:reason='Clipped audio.'
   elif m.get('resonance_sensitivity_pct',100)>12:reason='Resonance depends strongly on tracking settings.'
   elif not all(k in f for k in ['f0','delta_f','hnr','balance','pitch_span']):reason='Incomplete measurements.'
   clips.append({'id':name,'speaker':speaker,'name':speaker.upper(),'group':'female' if gender=='F' else 'male','group_source':'JVS gender_f0range.txt','language':'ja','native':True,'native_source':PAPER,'dataset':'JVS','style':'normal reading','utterance':key,'text':text,'audio':'/samples/'+dest.name,'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak'),'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),'tracking_sensitivity':m.get('resonance_sensitivity_pct'),'plotted':reason is None,'reason':reason,'source':SOURCE,'archive_member':member,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'license':'JVS personal/non-commercial research terms; audio redistribution restricted'})
 cachepath.write_text(json.dumps(cache,allow_nan=False))
 print(speaker,len(clips),'clips measured;',round(time.time()-start),'s',flush=True)
counts={g:{'clips':sum(c['group']==g for c in clips),'speakers':len({c['speaker'] for c in clips if c['group']==g}),'plotted_clips':sum(c['group']==g and c['plotted'] for c in clips),'plotted_speakers':len({c['speaker'] for c in clips if c['group']==g and c['plotted']})} for g in ['female','male']}
manifest={'version':VERSION,'language':'ja','source':'JVS native Japanese professional speakers','source_url':SOURCE,'native_source':PAPER,'license':'Personal/non-commercial research use. Audio redistribution restricted. Tags CC BY-SA 4.0. See source terms.','selection':'20 common normal-speech sentences and all nonpara30 sentences per speaker. Whisper/falsetto excluded.','archive_sha256':hashlib.file_digest((ROOT/'research/jvs_ver1.zip').open('rb'),'sha256').hexdigest(),'counts':counts,'failures':[],'clips':clips}
review_path=ROOT/'data/native-review.json'
if review_path.exists():
 review=json.loads(review_path.read_text());approved={r['id']:r['previous_label'] for r in review['native_clips']};old=json.loads((ROOT/'data/library.json').read_text())
 for c in old['clips']:
  if c['id'] in approved:manifest['clips'].append({**c,'native':True,'native_review':'user listening review','dataset':'Common Voice','name':'CV '+approved[c['id']].replace(' ','')})
for group in counts:
 rows=[c for c in clips if c['group']==group];counts[group]={'clips':len(rows),'speakers':len({c['speaker'] for c in rows}),'plotted_clips':sum(c['plotted'] for c in rows),'plotted_speakers':len({c['speaker'] for c in rows if c['plotted']})}
(ROOT/'data/native-ja.json').write_text(json.dumps(manifest,ensure_ascii=False,allow_nan=False));print('Native Japanese ready:',counts,flush=True)
