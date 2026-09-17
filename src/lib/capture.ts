class VoiceCapture extends AudioWorkletProcessor {
	buffer: Float32Array;
	used: number;
	constructor() {
		super();
		this.buffer = new Float32Array(4096);
		this.used = 0;
		this.port.onmessage = ({ data }) => {
			if (data === 'flush') {
				if (this.used) this.port.postMessage(this.buffer.slice(0, this.used));
				this.used = 0;
				this.port.postMessage('flushed');
			}
		};
	}
	process(inputs: Float32Array[][], _outputs: Float32Array[][], _parameters: Record<string, Float32Array>) {
		const channels = inputs[0];
		if (!channels?.length) return true;
		for (let i = 0; i < channels[0].length; i++) {
			let v = 0;
			for (const channel of channels) v += channel[i] / channels.length;
			this.buffer[this.used++] = v;
			if (this.used === this.buffer.length) {
				const packet = this.buffer;
				this.port.postMessage(packet, [packet.buffer]);
				this.buffer = new Float32Array(4096);
				this.used = 0;
			}
		}
		return true;
	}
}
registerProcessor('voice-capture', VoiceCapture);
