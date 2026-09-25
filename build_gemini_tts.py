"""Generate Japanese conversational references with Gemini 3.8 Flash TTS and measure every clip.

Each Japanese voice in the Gemini voice library speaks lines of everyday
conversation from curation/gemini-conversation-ja.json, prompted as unscripted
talk in the line's scene. Audio already under data/samples is measured without
calling the API, so the manifest rebuilds offline; only missing clips need
GEMINI_API_KEY.

API: https://ai.google.dev/gemini-api/docs/speech-generation (interactions),
https://ai.google.dev/api/voices (voice library; gender is the library's own
"perceived voice gender presentation" field).
"""
import argparse,asyncio,base64,hashlib,io,json,math,os,random
from pathlib import Path
import httpx,soundfile as sf
from engine import measure_files,version
ROOT=Path(__file__).parent
API='https://generativelanguage.googleapis.com/v1beta'
MODEL='gemini-3.8-flash-tts'
LINES=ROOT/'curation/gemini-conversation-ja.json'
VOICES=ROOT/'data/gemini-voices-ja.json'
DEST=ROOT/'data/gemini-tts.json'
# USD per 1M tokens, Gemini API standard rates through 2026-12-31.
PRICE={'text':.5,'audio':9}

def style(scene):
 return f'Unscripted everyday speech, {scene}. Relaxed and spontaneous, with the natural rhythm of real conversation; not reading aloud.'

async def list_voices(client):
 """The prebuilt Japanese catalogue, cached so reruns see the same voices."""
 if VOICES.exists():return json.loads(VOICES.read_text())
 voices=[];token=None
 while True:
  r=await client.get(f'{API}/voices',params={'type':'prebuilt','language_code':'ja-JP','page_size':1000,**({'page_token':token} if token else {})});r.raise_for_status();body=r.json()
  voices+=body.get('voices',[]);token=body.get('next_page_token')
  if not token:break
 VOICES.write_text(json.dumps(voices,ensure_ascii=False,indent=1));return voices

def plan(voices,per_voice,limit):
 """Pair each voice with its own hash-ordered lines, so a clip keeps its line when the counts or the line list grow; voices alternate by gender."""
 rng=random.Random(0);lines=json.loads(LINES.read_text())['lines']
 by={};[by.setdefault(v.get('gender'),[]).append(v) for v in sorted(voices,key=lambda v:v['id'])]
 for group in by.values():rng.shuffle(group)
 order=[v for row in zip(*[g+[None]*(max(map(len,by.values()))-len(g)) for g in by.values()]) for v in row if v][:limit]
 jobs=[]
 for v in order:
  for line in sorted(lines,key=lambda l:hashlib.sha256(f'{v["id"]}:{l["text"]}'.encode()).digest())[:per_voice]:
   id='gemini-'+hashlib.sha256(f'{MODEL}:{v["id"]}:{style(line["scene"])}:{line["text"]}'.encode()).hexdigest()[:16]
   jobs.append(dict(voice=v,line=line,id=id,path=ROOT/'data/samples'/f'{id}.flac'))
 return jobs

class QuotaExhausted(Exception):
 """The project's daily request quota is spent; nothing more can be generated today."""

async def speak(client,gate,stop,job):
 """Synthesise one clip, retrying on rate limits, server and network errors; the file appears only when complete."""
 body={'model':MODEL,'input':[{'type':'user_input','content':[{'type':'text','text':job['line']['text'],'annotations':[{'type':'speech_metadata','style':style(job['line']['scene'])}]}]}],
       'response_format':{'type':'audio'},'generation_config':{'speech_config':[{'voice':job['voice']['id']}]}}
 async with gate:
  for attempt in range(6):
   if stop.is_set():return None
   try:r=await client.post(f'{API}/interactions',json=body)
   except httpx.TransportError:await asyncio.sleep(2**attempt+random.random());continue
   if r.status_code==429 and 'per day' in r.text:
    if stop.is_set():return None
    stop.set();raise QuotaExhausted(r.json().get('error',{}).get('message',r.text[:300]))
   if r.status_code in (429,500,502,503,504):await asyncio.sleep(min(60,float(r.headers.get('retry-after') or 2**attempt)+random.random()));continue
   if r.is_error:raise RuntimeError(f'{r.status_code} {r.text[:300]}')
   out=r.json()
   audio=[c for s in out.get('steps',[]) for c in s.get('content') or [] if c.get('type')=='audio' and c.get('data')]
   if not audio:raise RuntimeError(f'no audio in response: {json.dumps(out)[:300]}')
   x,rate=sf.read(io.BytesIO(base64.b64decode(audio[0]['data'])),dtype='int16')
   tmp=job['path'].with_suffix('.tmp.flac');sf.write(tmp,x,rate,format='FLAC');tmp.replace(job['path'])
   return out.get('usage',{})
  raise RuntimeError('no success after retries')

def cost(usage):
 """USD for one response's usage block."""
 total=0
 for field,kind in (('input_tokens_by_modality','text'),('output_tokens_by_modality','audio')):
  for m in usage.get(field) or []:total+=m.get('tokens',0)*PRICE['audio' if m.get('modality')=='audio' else 'text']/1e6
 return total

async def generate(jobs,workers):
 missing=[j for j in jobs if not j['path'].exists()]
 if not missing:return
 key=os.environ.get('GEMINI_API_KEY')
 if not key:raise SystemExit(f'{len(missing)} clips missing; set GEMINI_API_KEY')
 gate=asyncio.Semaphore(workers);spent=[];log=ROOT/'data/gemini-tts-usage.jsonl'
 async with httpx.AsyncClient(headers={'x-goog-api-key':key},timeout=180) as client:
  stop=asyncio.Event()
  async def one(j):
   try:usage=await speak(client,gate,stop,j)
   except QuotaExhausted as e:print('STOPPED:',e,flush=True);return
   except Exception as e:print('FAILED',j['id'],j['voice']['id'],str(e)[:300],flush=True);return
   if usage is None:return
   spent.append(cost(usage))
   with log.open('a') as f:f.write(json.dumps({'id':j['id'],'usage':usage})+'\n')
   if len(spent)%25==0:print(f'{len(spent)}/{len(missing)} ${sum(spent):.3f}',flush=True)
  await asyncio.gather(*map(one,missing))
 if spent:print(f'generated {len(spent)} clips for ${sum(spent):.4f} (${sum(spent)/len(spent):.5f} each)',flush=True)

async def main():
 ap=argparse.ArgumentParser(description=__doc__.splitlines()[0])
 ap.add_argument('--per-voice',type=int,default=6,help='lines each voice speaks')
 ap.add_argument('--voices',type=int,default=1000,help='at most this many voices')
 ap.add_argument('--workers',type=int,default=8)
 a=ap.parse_args()
 async with httpx.AsyncClient(headers={'x-goog-api-key':os.environ.get('GEMINI_API_KEY','')},timeout=60) as client:voices=await list_voices(client)
 jobs=plan(voices,a.per_voice,a.voices)
 print(len(jobs),'clips from',len({j['voice']['id'] for j in jobs}),'voices',flush=True)
 await generate(jobs,a.workers)
 jobs=[j for j in jobs if j['path'].exists()]
 measured=measure_files(str(j['path']) for j in jobs);clips=[]
 for j in jobs:
  m=measured[str(j['path'])];f=m['features'];v=j['voice']
  ok=m.get('formant_seconds',0)>=.3 and math.isfinite(f.get('delta_f') or float('nan')) and m.get('resonance_sensitivity_pct',m.get('tracking_sensitivity',0))<=12
  clips.append({'id':j['id'],'speaker':f'gemini-{v["id"]}','name':f'Gemini:{v.get("display_name") or v["id"]}','group':'androgynous' if v.get('gender')=='neutral' else v.get('gender'),'voice_label':v.get('gender'),
   'group_source':'Gemini voice library gender field (neutral as androgynous); not a listener rating','synthetic':True,'language':'ja','text':j['line']['text'],'style':style(j['line']['scene']),
   'text_source':'curation/gemini-conversation-ja.json (lines written for this corpus)',
   'voice':{k:v.get(k) for k in ('id','display_name','accent','pitch','persona','context','description')},
   'audio':'/samples/'+j['path'].name,'duration':m['duration'],'features':f,'level_dbfs':m.get('level_dbfs'),'peak':m.get('peak'),
   'voiced_seconds':m['voiced_seconds'],'formant_seconds':m.get('formant_seconds',0),'plotted':bool(ok),'reason':None if ok else 'Unstable resonance estimate.',
   'source':'https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts','engine':f'Google Gemini API / {MODEL}','sha256':hashlib.sha256(j['path'].read_bytes()).hexdigest()})
 tmp=DEST.with_suffix('.tmp');tmp.write_text(json.dumps({'version':version(),'engine':MODEL,'clips':clips},ensure_ascii=False,allow_nan=False));tmp.replace(DEST)
 print('DONE',len(clips),'clips;',sum(c['plotted'] for c in clips),'mapped',flush=True)
if __name__=='__main__':asyncio.run(main())
