import { describe, it, vi } from 'vitest';
import { golden } from './golden';

type Port = { onmessage: (e: { data: unknown }) => void; postMessage: (data: unknown, transfer?: unknown[]) => void };
const registry: Record<string, new () => { process(inputs: Float32Array[][]): boolean; port: Port }> = {};
vi.stubGlobal('AudioWorkletProcessor', class { port = { onmessage: null as unknown, postMessage: (..._a: unknown[]) => {} }; });
vi.stubGlobal('registerProcessor', (name: string, cls: never) => { registry[name] = cls; });
// @ts-expect-error the worklet file registers a processor and exports nothing
await import('@app/capture');

function make() {
	const posted: unknown[] = [];
	const p = new registry['voice-capture']();
	const buffers = new Set<ArrayBufferLike>();
	p.port.postMessage = (data: unknown, transfer?: unknown[]) => {
		if (typeof data === 'string') return posted.push(data);
		const packet = data as Float32Array;
		buffers.add(packet.buffer);
		posted.push({ length: packet.length, head: Array.from(packet.slice(0, 3)), tail: Array.from(packet.slice(-2)), transferred: !!transfer, distinctBuffers: buffers.size });
	};
	return { p, posted };
}
const ramp = (n: number, k = 1) => Float32Array.from({ length: n }, (_, i) => (i * k) / 1000);

describe('voice-capture worklet', () => {
	it('registers under its name', () => { golden('capture.names', Object.keys(registry)); });
	it('mixes channels, emits 4096-sample packets and flushes the remainder', () => {
		const { p, posted } = make();
		const results = [p.process([]), p.process([[]]), p.process([[ramp(128)]]), p.process([[ramp(128), ramp(128, 3)]])];
		for (let i = 0; i < 31; i++) p.process([[ramp(128)]]);
		results.push(p.process([[ramp(128)]]));
		p.port.onmessage({ data: 'flush' });
		p.port.onmessage({ data: 'flush' });
		p.process([[ramp(4096)]]);
		p.port.onmessage({ data: 'other' });
		p.port.onmessage({ data: 'flush' });
		golden('capture.stream', { results, posted });
	});
});
