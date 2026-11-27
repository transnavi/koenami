// The Workers runtime's `cloudflare:workers` for the unit test of worker/analyzer.ts: the two
// base classes the container library extends, holding what the runtime hands them.
class Base {
	constructor(
		readonly ctx: unknown,
		readonly env: unknown
	) {}
}
export class DurableObject extends Base {}
export class WorkerEntrypoint extends Base {}
