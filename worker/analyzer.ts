import { Container } from '@cloudflare/containers';

import { matchLanguage } from '../src/lib/i18n';
import { m } from '../src/lib/paraglide/messages';

// The Python analyzer runs in one Cloudflare Container; the Worker forwards analysis
// requests to it and the class name is bound as the ANALYZER Durable Object.
export class VoiceAnalyzer extends Container<Env> {
	defaultPort = 8080;
	sleepAfter = '1m';
	enableInternet = false;
	envVars = { KOENAMI_PUBLIC: '1', KOENAMI_DATA: '/app/data' };
	// The longest one request may occupy the container: a cold start, then one minute of audio.
	responseTimeoutMs = 120_000;

	// The container stays awake while a response body is still being read, and a body handed
	// to a caller that has gone away is never read to its end. Every response is read here,
	// inside the time limit, and returned whole, so the idle clock starts when the analyzer
	// has answered.
	override async fetch(request: Request): Promise<Response> {
		const deadline = AbortSignal.timeout(this.responseTimeoutMs);
		const signal = AbortSignal.any([request.signal, deadline]);
		const unavailable = (status: number) =>
			new Response(
				m.api_busy({}, { locale: matchLanguage(request.headers.get('Accept-Language')) }),
				{
					status,
					headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
				}
			);

		const response = await super.fetch(new Request(request, { signal }));
		const reader = response.body?.getReader();
		if (!reader) return response;
		const cancel = () => void reader.cancel(signal.reason).catch(() => {});
		signal.addEventListener('abort', cancel, { once: true });
		if (signal.aborted) cancel();
		try {
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			if (signal.aborted) return unavailable(504);
			return new Response(await new Blob(chunks).arrayBuffer(), response);
		} catch {
			return unavailable(signal.aborted ? 504 : 502);
		} finally {
			signal.removeEventListener('abort', cancel);
		}
	}
}
