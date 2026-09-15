import asyncio
import threading
import unittest
from unittest.mock import patch
import numpy as np
from aiohttp.test_utils import TestClient, TestServer
import server
import perception


class WindowTests(unittest.TestCase):
    def test_bounded_with_model_specific_preprocessing(self):
        x=np.sin(np.arange(16000*60)*.1).astype(np.float32)
        parts=perception.windows(x)
        self.assertEqual(len(parts),3)
        self.assertTrue(all(p.shape==(1,64000) for p in parts))
        self.assertTrue(all(abs(float(perception.age_input(p).mean()))<1e-5 for p in parts))
        self.assertEqual(len(perception.windows(x[:16000*6])),2)
        padded=np.pad(x[:64000],(16000*20,16000*20))
        self.assertLessEqual(len(perception.windows(padded)),2)

    def test_short_or_silent_rejected(self):
        for x in [np.zeros(64000,dtype=np.float32),np.ones(16000,dtype=np.float32)]:
            with self.assertRaises(ValueError):perception.windows(x)


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client=TestClient(TestServer(server.create_app()))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_invalid_pcm_is_rejected(self):
        with patch.object(perception,'available',return_value=True):
            r=await self.client.post('/api/perception',data=np.full(32000,np.nan,dtype='<f4').tobytes())
            self.assertEqual(r.status,400)

    async def test_neural_request_does_not_queue_more_pcm(self):
        entered=threading.Event();release=threading.Event()
        def describe(x):
            entered.set();release.wait(5)
            return {'embedding':[0.]*512,'version':'test'}
        with patch.object(perception,'available',return_value=True),patch.object(server,'measure',return_value={'voiced_seconds':2,'track':[]}),patch.object(perception,'describe',side_effect=describe):
            pcm=(.2*np.sin(np.arange(32000)*.1)).astype('<f4').tobytes()
            first=asyncio.create_task(self.client.post('/api/perception',data=pcm))
            try:
                await asyncio.to_thread(entered.wait,5)
                self.assertTrue(entered.is_set())
                second=await self.client.post('/api/perception',data=pcm)
                self.assertEqual(second.status,503)
                health=await self.client.get('/api/health')
                self.assertEqual(health.status,200)
                with patch.object(server,'visualise',return_value={}):
                    live=await self.client.post('/api/analyze?live=1',data=pcm)
                    self.assertEqual(live.status,200)
            finally:release.set()
            self.assertEqual((await first).status,200)


if __name__=='__main__':unittest.main()
