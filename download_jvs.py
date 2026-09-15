from pathlib import Path
import requests,time
root=Path(__file__).parent
url='https://drive.usercontent.google.com/download?id=19oAw8wWn3Y7z6CKChRdAyGOB9yupL_Xt&export=download&confirm=t'
r=requests.get(url,stream=True,timeout=(30,90));r.raise_for_status();print('JVS download',r.headers.get('Content-Type'),r.headers.get('Content-Length'),flush=True)
if 'text/html' in r.headers.get('Content-Type',''):raise RuntimeError('Archive download returned a confirmation page.')
path=root/'research/jvs_ver1.zip.part';size=0;last=time.time()
with path.open('wb') as f:
 for block in r.iter_content(4*1024*1024):
  f.write(block);size+=len(block)
  if time.time()-last>10:print('JVS downloaded',round(size/1e6),'MB',flush=True);last=time.time()
path.replace(path.with_suffix(''));print('JVS archive complete',size,flush=True)
