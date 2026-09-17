// See https://svelte.dev/docs/kit/types#app.d.ts
// The Worker's bindings, by shape: the Cloudflare runtime types declare an HTMLRewriter
// `Element` that shadows the DOM's, so this program never references them (worker/ and
// worker.ts have their own tsconfig with them). The names match wrangler.jsonc.
declare global {
	namespace App {
		interface Platform {
			env: {
				ASSETS: { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
				ANALYZER: { idFromName(name: string): unknown; get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> } };
				ANALYSIS_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
			};
			ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void };
		}
	}
}

export {};
