import { getContainer } from '@cloudflare/containers';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';
import fontJaRegular from './web/public/fonts/koenami-share-ja-400.ttf';
import fontJaBold from './web/public/fonts/koenami-share-ja-700.ttf';
import fontZhRegular from './web/public/fonts/koenami-share-zh-CN-400.ttf';
import fontZhBold from './web/public/fonts/koenami-share-zh-CN-700.ttf';
import fontKoRegular from './web/public/fonts/koenami-share-ko-400.ttf';
import fontKoBold from './web/public/fonts/koenami-share-ko-700.ttf';
import { Scorer, parseResultParams, resultParams, shareText, formatScore, verdictLabel, leaningLabel } from './web/score.js';
import { cardSVG } from './web/card.js';
import { LANGUAGES, fontFamily, fontCut, known, matchLanguage, translator } from './web/i18n/index.js';

export { VoiceAnalyzer } from './worker/analyzer';

const languages = new Set<string>(LANGUAGES);
// The share font in its three cuts; the card's language picks one (see web/share.js).
const cardFonts: Record<ReturnType<typeof fontCut>, [ArrayBuffer, ArrayBuffer]> = { ja: [fontJaRegular, fontJaBold], 'zh-CN': [fontZhRegular, fontZhBold], ko: [fontKoRegular, fontKoBold] };
// Error text in the language the client asked for; the studio sends its own language.
const say = (request: Request, key: string) => translator(matchLanguage(request.headers.get('Accept-Language')))(key) as string;
// Crawler and browser-chrome files at the site root (see web/public and prepare_public.py).
const siteFiles = /^\/(robots\.txt|sitemap\.xml|site\.webmanifest|sw\.js|language\.js|og-(image|guide|tutorial|method|references)\.png|screenshot-(wide|narrow)\.png|favicon\.(svg|ico)|favicon-96x96\.png|apple-touch-icon\.png|icon-(192|512|maskable-512)\.png)$/;
const maxBytes = 16000 * 4 * 60;
const siteOrigin = 'https://koe.transnavi.jp';

// One scorer per language per isolate; the reference library only changes with a deploy.
const scorers = new Map<string, Promise<Scorer>>();
function scorer(env: Env, lang: string): Promise<Scorer> {
  let pending = scorers.get(lang);
  if (!pending) {
    pending = env.ASSETS.fetch(new Request(`${siteOrigin}/public-api/${lang}.json`))
      .then(async (r) => { if (!r.ok) throw new Error('library'); return new Scorer((await r.json() as { clips: unknown[] }).clips); })
      .catch((e) => { scorers.delete(lang); throw e; });
    scorers.set(lang, pending);
  }
  return pending;
}
let resvgReady: Promise<void> | undefined;

// A shared result: the five measurements in the query string, scored against the language's references.
async function sharedResult(env: Env, url: URL) {
  const parsed = parseResultParams(url.searchParams);
  if (!parsed || !languages.has(parsed.lang)) return null;
  const s = await scorer(env, parsed.lang);
  const result = s.score(parsed.features);
  if (!result) return null;
  const canonical = `${siteOrigin}/r?${resultParams(result.features, parsed.lang)}`;
  return { scorer: s, result, lang: parsed.lang, canonical, image: `${siteOrigin}/og.png?${resultParams(result.features, parsed.lang)}` };
}

async function resultPage(request: Request, env: Env, url: URL): Promise<Response> {
  // The page is written in the language of the link (its `l`), like the verdict it recomputes.
  const lang = known(url.searchParams.get('l')), t = translator(lang);
  const page = await env.ASSETS.fetch(new Request(`${siteOrigin}${lang === 'ja' ? '' : '/' + lang}/result.html`, request));
  const shared = await sharedResult(env, url).catch(() => null);
  if (!shared) return page;
  const verdict = shared.result.verdict as string;
  const title = t('result.window_title', { verdict: verdictLabel(verdict, lang), leaning: leaningLabel(verdict, lang), score: formatScore(shared.result.display) }) as string;
  const description = t('result.share_description', { text: shareText(shared.result, lang) }) as string;
  const content: Record<string, string> = {
    'og:title': title, 'twitter:title': title, 'og:description': description, 'twitter:description': description,
    'og:url': shared.canonical, 'og:image': shared.image, 'twitter:image': shared.image, 'og:image:alt': shareText(shared.result, lang),
  };
  return new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta', { element(el) {
      const key = el.getAttribute('property') || el.getAttribute('name');
      if (key && content[key]) el.setAttribute('content', content[key]);
    } })
    .transform(page);
}

async function resultImage(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const shared = await sharedResult(env, url).catch(() => null);
  if (!shared) return text('Not found', 404);
  const cache = caches.default;
  const key = new Request(shared.image, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  // Every distinct query renders anew, so uncached renders share the analysis rate limit.
  const { success } = await env.ANALYSIS_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!success) return text(say(request, 'api.busy'), 429, { 'Retry-After': '10' });
  resvgReady ??= initWasm(resvgWasm).catch((e) => { resvgReady = undefined; throw e; });
  await resvgReady;
  const svg = cardSVG(shared.result, shared.scorer, { lang: shared.lang });
  const [regular, bold] = cardFonts[fontCut(shared.lang)];
  const renderer = new Resvg(svg, { font: { fontBuffers: [new Uint8Array(regular), new Uint8Array(bold)], loadSystemFonts: false, defaultFontFamily: fontFamily(shared.lang) } });
  let png: Uint8Array;
  try { png = renderer.render().asPng(); } finally { renderer.free(); }
  const response = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800, immutable' } });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}
function text(message: string, status: number, headers: Record<string, string> = {}) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
  } else if (get && (url.pathname === '/' || /^\/ja\/?$/.test(url.pathname))) asset = '/index.html';
  else if (get && /^\/(zh-CN|en|ko)\/?$/.test(url.pathname)) asset = `/${url.pathname.split('/')[1]}/index.html`;
  else if (get && /^\/(zh-CN|en|ko)\/site\.webmanifest$/.test(url.pathname)) asset = url.pathname;
  else if (request.method === 'GET' && url.pathname === '/r') return resultPage(request, env, url);
  else if (request.method === 'GET' && url.pathname === '/og.png') return resultImage(request, env, ctx, url);
  else if (get && (/^\/(assets|samples|fonts)\/[^/]+$/.test(url.pathname) || /^\/(method|guide|tutorial|references)\.html$/.test(url.pathname) || siteFiles.test(url.pathname))) asset = url.pathname;
  if (asset) {
    url.pathname = asset; url.search = '';
    return env.ASSETS.fetch(new Request(url, request));
  }

  const analysis = ['/api/analyze', '/api/age'].includes(url.pathname) && request.method === 'POST';
  const detail = /^\/api\/detail\/[a-zA-Z0-9_-]+$/.test(url.pathname) && get;
  if (!analysis && !detail && !(get && url.pathname === '/api/health')) return text('Not found', 404);
  const { success } = await env.ANALYSIS_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!success) return text(say(request, 'api.busy'), 429, { 'Retry-After': '10' });

  let body: ArrayBuffer | undefined;
  if (analysis) {
    const length = Number(request.headers.get('Content-Length'));
    if (length > maxBytes) return text(say(request, 'api.too_long'), 413);
    // Bound reads even when the sender omits or lies about Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return text(say(request, 'api.no_audio'), 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); return text(say(request, 'api.too_long'), 413); }
      chunks.push(value);
    }
    if (size < 16000 || size % 4) return text(say(request, 'api.too_short'), 400);
    const pcm = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.byteLength; }
    body = pcm.buffer;
  }
  const internal = new URL(url.pathname + url.search, 'http://localhost:8080');
  return getContainer(env.ANALYZER, 'demo').fetch(new Request(internal, {
    method: request.method, headers: { 'Content-Type': 'application/octet-stream', 'Accept-Language': request.headers.get('Accept-Language') || 'ja' }, body,
  }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const response = await handle(request, env, ctx);
      const secured = new Response(response.body, response);
      secured.headers.set('X-Content-Type-Options', 'nosniff');
      secured.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
      secured.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return secured;
    } catch {
      return text(say(request, 'api.starting'), 503, { 'Retry-After': '5' });
    }
  },
} satisfies ExportedHandler<Env>;
