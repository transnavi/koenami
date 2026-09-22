// Worker runtime types are checked separately by check:worker; keep them out of the DOM tests.
import { describe, expect, it, vi } from 'vitest';

import worker from '../../worker.ts';

vi.mock('@cloudflare/containers', () => ({ getContainer: vi.fn() }));
vi.mock('../../worker/analyzer', () => ({ VoiceAnalyzer: vi.fn() }));
vi.mock('@resvg/resvg-wasm', () => ({ initWasm: vi.fn(), Resvg: vi.fn() }));
vi.mock('@resvg/resvg-wasm/index_bg.wasm', () => ({ default: null }));

describe('public tutorial routing', () => {
	for (const path of [
		'/tutorial.html',
		'/en/tutorial.html',
		'/img/vocal-folds-open.jpg',
		'/img/vocal-folds-closed.jpg',
		'/img/head-sagittal.png'
	]) {
		for (const method of ['GET', 'HEAD']) {
			it(`${method} ${path} reaches the static asset binding`, async () => {
				const fetch = vi.fn(async (_request) => new Response('asset'));
				const env = { ASSETS: { fetch } };
				const ctx = {};
				const response = await worker.fetch(
					new Request(`https://koe.test${path}?cache=1`, { method }),
					env,
					ctx
				);
				expect(response.status).toBe(200);
				const request = fetch.mock.calls[0]?.[0];
				expect(request?.url).toBe(`https://koe.test${path}`);
				expect(request?.method).toBe(method);
			});
		}
	}
});
