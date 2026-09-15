import { Container, getContainer } from '@cloudflare/containers';

export class VoiceAnalyzer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '1m';
  enableInternet = false;
  envVars = { KOENAMI_PUBLIC: '1', KOENAMI_DATA: '/app/data' };
}

const languages = new Set(['ja', 'zh-CN', 'en', 'ko']);
const maxBytes = 16000 * 4 * 60;
function text(message: string, status: number, headers: Record<string, string> = {}) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('Cross-origin requests are disabled.', 403);
  const get = request.method === 'GET' || request.method === 'HEAD';
  let asset: string | undefined;
  if (get && url.pathname === '/api/catalog') asset = '/public-api/catalog.json';
  else if (get && url.pathname === '/api/import-index/jvs') asset = '/public-api/jvs-index.json';
  else if (get && url.pathname === '/api/library') {
    const lang = url.searchParams.get('lang') || 'ja';
    if (!languages.has(lang)) return text('Not found', 404);
    asset = `/public-api/${lang}.json`;
  } else if (get && (url.pathname === '/' || /^\/(ja|zh-CN|en|ko)\/?$/.test(url.pathname))) asset = '/index.html';
  else if (get && (/^\/(assets|samples)\/[^/]+$/.test(url.pathname) || url.pathname === '/method.html')) asset = url.pathname;
  if (asset) {
    url.pathname = asset; url.search = '';
    return env.ASSETS.fetch(new Request(url, request));
  }

  const analysis = url.pathname === '/api/analyze' && request.method === 'POST';
  const detail = /^\/api\/detail\/[a-zA-Z0-9_-]+$/.test(url.pathname) && get;
  if (!analysis && !detail && !(get && url.pathname === '/api/health')) return text('Not found', 404);
  const { success } = await env.ANALYSIS_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!success) return text('少し待ってからお試しください。', 429, { 'Retry-After': '10' });

  let body: ArrayBuffer | undefined;
  if (analysis) {
    const length = Number(request.headers.get('Content-Length'));
    if (length > maxBytes) return text('1分以内の音声を選んでください。', 413);
    // Bound reads even when the sender omits or lies about Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return text('音声がありません。', 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return text('1分以内の音声を選んでください。', 413); }
      chunks.push(value);
    }
    if (size < 16000 || size % 4) return text('0.25秒以上の音声を使用してください。', 400);
    const pcm = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.byteLength; }
    body = pcm.buffer;
  }
  const internal = new URL(url.pathname + url.search, 'http://localhost:8080');
  return getContainer(env.ANALYZER, 'demo').fetch(new Request(internal, {
    method: request.method, headers: { 'Content-Type': 'application/octet-stream' }, body,
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const response = await handle(request, env);
      const secured = new Response(response.body, response);
      secured.headers.set('X-Content-Type-Options', 'nosniff');
      secured.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
      secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return secured;
    } catch {
      return text('解析サーバーを準備しています。少し待ってからお試しください。', 503, { 'Retry-After': '5' });
    }
  },
} satisfies ExportedHandler<Env>;
