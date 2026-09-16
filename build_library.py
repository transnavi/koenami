"""Collect Common Voice Japanese reference audio from its pinned source."""
import asyncio
from pathlib import Path
import aiohttp

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

