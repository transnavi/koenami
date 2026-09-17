"""Exercise the public image without Cloudflare's local WSL networking adapter."""
import re
import subprocess
from pathlib import Path

SCRIPT = '''import asyncio, numpy as np, time, resource
from aiohttp.test_utils import TestClient, TestServer
from server import create_app, RATE
async def main():
 async with TestClient(TestServer(create_app())) as client:
  response=await client.get('/api/catalog'); assert response.status==200
  catalog=await response.json(); assert catalog['capabilities']=={'words':False,'maxSeconds':60,'review':False}
  response=await client.get('/api/library?lang=ja'); library=await response.json()
  assert len(library['clips'])>1550
  assert sum(c.get('dataset')=='JVS' for c in library['clips'])==10
  assert sum(c.get('dataset')=='Common Voice' for c in library['clips'])>1500
  assert not any(c['speaker'] in {'ce8c56a9dbfb','927b34792e63'} for c in library['clips'])
  clip=next(c for c in library['clips'] if c.get('dataset')=='JVS')
  response=await client.get('/api/detail/'+clip['id']); assert response.status==200
  assert (await response.json())['features']['f0']>65
  started=time.perf_counter()
  live_pcm=(.2*np.sin(2*np.pi*200*np.arange(RATE*3)/RATE)).astype('<f4').tobytes()
  live=await client.post('/api/analyze?live=1',data=live_pcm)
  assert live.status==200,await live.text()
  print('Live seconds:',round(time.perf_counter()-started,2),'peak RSS MiB:',round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024),flush=True)
  response=await client.get('/api/review'); assert response.status==404
  started=time.perf_counter()
  voice=(.2*np.sin(2*np.pi*(180+40*np.sin(np.arange(RATE*5)/RATE))*np.arange(RATE*5)/RATE)).astype('<f4')
  response=await client.post('/api/age',data=voice.tobytes()); assert response.status==200, await response.text()
  age=await response.json(); assert age['target']=='speaker-age' and 0<age['estimate']<120 and 1<=age['windows']<=3
  assert age['windowRange'][0]<=age['estimate']<=age['windowRange'][1]
  print('Age cold seconds:',round(time.perf_counter()-started,2),'peak RSS MiB:',round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024),flush=True)
  response=await client.post('/api/age',data=voice[:RATE].tobytes()); assert response.status==422
  response=await client.post('/api/age',data=np.zeros(RATE*60+1,dtype='<f4').tobytes()); assert response.status==400
  pcm=(.2*np.sin(2*np.pi*200*np.arange(RATE*2)/RATE)).astype('<f4').tobytes()
  for query in ['', '?live=1']:
   response=await client.post('/api/analyze'+query,data=pcm); assert response.status==200
  for path in ['/data/baseline.wav','/api/detail/baseline','/api/words']:
   response=await client.get(path); assert response.status in (404,405)
  response=await client.post('/api/analyze',data=np.zeros(RATE*60+1,dtype='<f4').tobytes())
  assert response.status==400
  print('PASS: public catalog, Japanese references, exclusions, reference analysis, upload, live, age, recording limit, private routes')
asyncio.run(main())
'''

if __name__ == '__main__':
    result = subprocess.run(['docker', 'run', '--rm', '--memory', '1g', '--cpus', '.25',
                             '--network', 'none', '-i', '--entrypoint', 'python', 'koenami-demo:check', '-'],
                            input=SCRIPT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(re.sub(r'/home/[^/\s]+', '/home/<username>', result.stdout))
    raise SystemExit(result.returncode)
