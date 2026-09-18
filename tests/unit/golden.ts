import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { expect } from 'vitest';

const dir = new URL('../golden/unit/', import.meta.url);
const record = process.env.RECORD === '1';
const tree = process.env.KOENAMI_TREE || 'old';

// Canonical JSON: sorted keys, doubles serialized by JSON.stringify (exact round trip, so
// a last-ulp difference fails), with undefined, -0, non-finite numbers, Maps, Sets and
// typed arrays made representable.
export function canonical(value: unknown): unknown {
	if (value === undefined) return { $undefined: true };
	if (typeof value === 'number')
		return Number.isFinite(value) && !Object.is(value, -0)
			? value
			: { $number: Object.is(value, -0) ? '-0' : String(value) };
	if (value instanceof Map)
		return { $map: [...value].map(([k, v]) => [canonical(k), canonical(v)]) };
	if (value instanceof Set) return { $set: [...value].map(canonical) };
	if (ArrayBuffer.isView(value))
		return {
			$typed: value.constructor.name,
			values: Array.from(value as unknown as ArrayLike<number>)
		};
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, canonical((value as Record<string, unknown>)[k])])
		);
	}
	return value;
}

// Compares `actual` with the committed golden, or writes it when RECORD=1. Goldens
// describe the pinned vanilla tree; recording them from the rewrite would turn the suite
// into a tautology, so recording is refused there except for what only the Kit tree has
// (`tree: 'new'`), which is pinned from the build that introduced it.
export function golden(name: string, actual: unknown, { tree: own = 'old' } = {}) {
	const file = new URL(`${name}.json`, dir);
	const text = JSON.stringify(canonical(actual), null, 1) + '\n';
	if (record) {
		if (tree !== own)
			throw new Error(`RECORD=1 for ${name} is only valid with KOENAMI_TREE=${own}`);
		mkdirSync(dir, { recursive: true });
		writeFileSync(file, text);
		return;
	}
	if (!existsSync(file))
		throw new Error(`missing golden ${name}; run with RECORD=1 against the ${own} tree`);
	expect(text).toBe(readFileSync(file, 'utf8'));
}

export async function sha256(bytes: ArrayBuffer | ArrayBufferView): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
}
