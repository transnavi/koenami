import { Container } from '@cloudflare/containers';

// The Python analyzer runs in one Cloudflare Container; the Worker forwards analysis
// requests to it and the class name is bound as the ANALYZER Durable Object.
export class VoiceAnalyzer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '1m';
  enableInternet = false;
  envVars = { KOENAMI_PUBLIC: '1', KOENAMI_DATA: '/app/data' };
}
