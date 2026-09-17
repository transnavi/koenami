// The AudioWorklet global scope, which lib.dom leaves out (capture.ts runs there).
declare class AudioWorkletProcessor {
	readonly port: MessagePort;
	constructor();
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;
