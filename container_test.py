"""Exercise the public image without Cloudflare's local WSL networking adapter."""
import re
import subprocess
from pathlib import Path

SCRIPT = '''import asyncio, numpy as np
from aiohttp.test_utils import TestClient, TestServer
from server import create_app, RATE
async def main():
 async with TestClient(TestServer(create_app())) as client:
  response=await client.get('/api/catalog'); assert response.status==200
  catalog=await response.json(); assert catalog['capabilities']=={'words':False,'maxSeconds':60}
  response=await client.get('/api/library?lang=ja'); library=await response.json()
  assert len(library['clips'])==67
  clip=next(c for c in library['clips'] if c.get('dataset')=='JVS')
  response=await client.get('/api/detail/'+clip['id']); assert response.status==200
  assert (await response.json())['features']['f0']>65
  pcm=(.2*np.sin(2*np.pi*200*np.arange(RATE*2)/RATE)).astype('<f4').tobytes()
  for query in ['', '?live=1']:
   response=await client.post('/api/analyze'+query,data=pcm); assert response.status==200
  for path in ['/data/baseline.wav','/api/detail/baseline','/api/words']:
   response=await client.get(path); assert response.status in (404,405)
  response=await client.post('/api/analyze',data=np.zeros(RATE*60+1,dtype='<f4').tobytes())
  assert response.status==400
  print('PASS: public catalog, 67 Japanese references, native reference analysis, upload, live, recording limit, private routes')
asyncio.run(main())
'''

if __name__ == '__main__':
    result = subprocess.run(['docker', 'run', '--rm', '--memory', '1g', '--cpus', '1',
                             '--network', 'none', '-i', '--entrypoint', 'python', 'koenami-demo:check', '-'],
                            input=SCRIPT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(re.sub(r'/home/[^/\s]+', '/home/<username>', result.stdout))
    raise SystemExit(result.returncode)
