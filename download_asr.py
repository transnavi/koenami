"""Fetch a pinned local Whisper model using ordinary HTTP streaming."""
from pathlib import Path
import requests,hashlib,json
root=Path(__file__).parent/'.models/turbo';root.mkdir(parents=True,exist_ok=True)
repo='mobiuslabsgmbh/faster-whisper-large-v3-turbo'
s=requests.Session();meta=s.get('https://huggingface.co/api/models/'+repo,timeout=30);meta.raise_for_status();revision=meta.json()['sha']
for name in ['config.json','preprocessor_config.json','tokenizer.json','vocabulary.json','model.bin']:
 dest=root/name
 if dest.exists() and dest.stat().st_size>100:continue
 r=s.get(f'https://huggingface.co/{repo}/resolve/{revision}/{name}?download=true',stream=True,timeout=(30,90));r.raise_for_status()
 size=0;tmp=dest.with_suffix(dest.suffix+'.part')
 with tmp.open('wb') as f:
  for block in r.iter_content(4*1024*1024):
   f.write(block);size+=len(block)
   if name=='model.bin' and size%(64*1024*1024)==0:print('Whisper model:',size//1024//1024,'MiB',flush=True)
 tmp.replace(dest);print('Downloaded',name,size,flush=True)
(root/'provenance.json').write_text(json.dumps({'repo':repo,'revision':revision}))
