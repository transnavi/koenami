/// <reference path="./worker-configuration.d.ts" />
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
		}
	}
}

export {};
