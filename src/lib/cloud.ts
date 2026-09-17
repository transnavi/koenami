// A shared density field, diffused before colour is applied. Every speaker has
// equal total weight, regardless of how many of their clips are in the library.
export type CloudPoint = {
	xy: [number, number];
	sample: { synthetic?: boolean; group: string; speaker: string };
};
export type CloudOptions = {
	width: number;
	height: number;
	scale: number;
	colors: Record<string, string>;
	dark: boolean;
};

function blur(
	source: Float32Array,
	target: Float32Array,
	w: number,
	h: number,
	r: number,
	horizontal: boolean
) {
	const outer = horizontal ? h : w,
		inner = horizontal ? w : h,
		step = horizontal ? 1 : w,
		span = 2 * r + 1;
	for (let line = 0; line < outer; line++) {
		const base = horizontal ? line * w : line;
		let sum = 0;
		for (let k = 0; k <= r && k < inner; k++) sum += source[base + k * step];
		for (let k = 0; k < inner; k++) {
			target[base + k * step] = sum / span;
			if (k - r >= 0) sum -= source[base + (k - r) * step];
			if (k + r + 1 < inner) sum += source[base + (k + r + 1) * step];
		}
	}
}
export class DensityCloud {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	a = new Float32Array(0);
	b = new Float32Array(0);
	// Created with the field buffers on the first draw, which always resizes from 0×0.
	image!: ImageData;
	constructor() {
		this.canvas = document.createElement('canvas');
		this.ctx = this.canvas.getContext('2d')!;
	}
	draw(
		ctx: CanvasRenderingContext2D,
		points: CloudPoint[],
		{ width, height, scale, colors, dark }: CloudOptions
	) {
		const pixel = 6,
			sigma = Math.max(36, Math.min(180, scale * 0.15)),
			r = Math.max(2, Math.round(sigma / pixel)),
			pad = 3 * r + 2,
			w = Math.ceil(width / pixel) + pad * 2,
			h = Math.ceil(height / pixel) + pad * 2;
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
			this.a = new Float32Array(w * h);
			this.b = new Float32Array(w * h);
			this.image = this.ctx.createImageData(w, h);
		}
		points = points.filter((p) => !p.sample.synthetic);
		const counts = new Map<string, number>();
		for (const p of points) {
			const key = p.sample.group + ':' + p.sample.speaker;
			counts.set(key, (counts.get(key) || 0) + 1);
		}
		for (const group of ['male', 'female']) {
			const selected = points.filter((p) => p.sample.group === group);
			if (!selected.length) continue;
			const a = this.a,
				b = this.b;
			a.fill(0);
			for (const p of selected) {
				const x = p.xy[0] / pixel + pad,
					y = p.xy[1] / pixel + pad,
					ix = Math.floor(x),
					iy = Math.floor(y),
					dx = x - ix,
					dy = y - iy,
					weight = 1 / counts.get(group + ':' + p.sample.speaker)!;
				if (ix < 0 || iy < 0 || ix >= w - 1 || iy >= h - 1) continue;
				const at = iy * w + ix;
				a[at] += (1 - dx) * (1 - dy) * weight;
				a[at + 1] += dx * (1 - dy) * weight;
				a[at + w] += (1 - dx) * dy * weight;
				a[at + w + 1] += dx * dy * weight;
			}
			// Three separable box passes approximate Gaussian diffusion in linear time.
			for (let pass = 0; pass < 3; pass++) {
				blur(a, b, w, h, r, true);
				blur(b, a, w, h, r, false);
			}
			let peak = 0;
			for (let i = 0; i < a.length; i++) peak = Math.max(peak, a[i]);
			if (!peak) continue;
			const rgb = colors[group].match(/[a-f\d]{2}/gi)?.map((v) => parseInt(v, 16)) || [
					180, 150, 200
				],
				rgba = this.image.data,
				opacity = dark ? 0.32 : 0.23;
			for (let y = 0; y < h; y++)
				for (let x = 0; x < w; x++) {
					const i = y * w + x,
						at = i * 4,
						sx = (x - pad) * pixel,
						sy = (y - pad) * pixel;
					const edge = Math.max(
						0,
						Math.min(1, sx / 22, sy / 22, (width - sx) / 22, (height - sy) / 22)
					);
					rgba[at] = rgb[0];
					rgba[at + 1] = rgb[1];
					rgba[at + 2] = rgb[2];
					rgba[at + 3] =
						255 * opacity * Math.pow(Math.max(0, a[i]) / peak, 0.68) * edge * edge * (3 - 2 * edge);
				}
			this.ctx.putImageData(this.image, 0, 0);
			ctx.drawImage(this.canvas, -pad * pixel, -pad * pixel, w * pixel, h * pixel);
		}
	}
}
