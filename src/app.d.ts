/// <reference path="./worker-configuration.d.ts" />
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Platform {
			// Env comes from the adapter config (assets only); the bindings wrangler.jsonc adds
			// are declared here until worker/entry.ts becomes the deployed entry.
			env: Env & { ANALYZER: DurableObjectNamespace; ANALYSIS_LIMIT: RateLimit };
			ctx: ExecutionContext;
		}
	}
}

export {};
