import { finite, quantile } from './math';

/* Robust, speaker-balanced standardization underlies both projections.
   variance: PCA over all samples; gender labels never enter it.
   contrast: the Fisher axis between female- and male-labeled samples comes first,
   within-class spread orthogonal to it after. Offered only when both labels exist. */
export type FeatureKey = 'f0' | 'delta_f' | 'hnr' | 'balance' | 'pitch_span';
export type Features = Partial<Record<FeatureKey, number | null>>;
export type Sample = { features?: Features | null; group?: string | null };
export type Projection = { axes: number[][]; values: number[]; bounds: [number, number][] };

function eigen(matrix: number[][]): number[][] {
	const n = matrix.length,
		a = matrix.map((r) => [...r]),
		v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
	for (let sweep = 0; sweep < 150; sweep++) {
		let p = 0,
			q = 1;
		for (let i = 0; i < n; i++)
			for (let j = i + 1; j < n; j++)
				if (Math.abs(a[i][j]) > Math.abs(a[p][q])) {
					p = i;
					q = j;
				}
		if (Math.abs(a[p][q]) < 1e-10) break;
		const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
			c = Math.cos(theta),
			s = Math.sin(theta),
			ap = a[p][p],
			aq = a[q][q],
			cross = a[p][q];
		a[p][p] = c * c * ap - 2 * s * c * cross + s * s * aq;
		a[q][q] = s * s * ap + 2 * s * c * cross + c * c * aq;
		a[p][q] = a[q][p] = 0;
		for (let k = 0; k < n; k++) {
			if (k !== p && k !== q) {
				const kp = a[k][p],
					kq = a[k][q];
				a[k][p] = a[p][k] = c * kp - s * kq;
				a[k][q] = a[q][k] = s * kp + c * kq;
			}
			const vp = v[k][p],
				vq = v[k][q];
			v[k][p] = c * vp - s * vq;
			v[k][q] = s * vp + c * vq;
		}
	}
	const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i]);
	return order.map((i) => {
		const axis = v.map((r) => r[i]),
			biggest = axis.reduce((b, x, k) => (Math.abs(x) > Math.abs(axis[b]) ? k : b), 0);
		return axis.map((x) => x * (axis[biggest] < 0 ? -1 : 1));
	});
}
function solve(matrix: number[][], b: number[]): number[] {
	const n = b.length,
		a = matrix.map((r, i) => [...r, b[i]]);
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
		[a[c], a[p]] = [a[p], a[c]];
		const d = a[c][c] || 1e-12;
		for (let r = 0; r < n; r++) {
			if (r === c) continue;
			const f = a[r][c] / d;
			if (!f) continue;
			for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
		}
	}
	return a.map((r, i) => r[n] / (r[i] || 1e-12));
}
function orthogonalize(vector: number[], axes: number[][]): number[] | null {
	const out = [...vector];
	for (const axis of axes) {
		const d = out.reduce((s, x, k) => s + x * axis[k], 0);
		for (let k = 0; k < out.length; k++) out[k] -= d * axis[k];
	}
	const norm = Math.sqrt(out.reduce((s, x) => s + x * x, 0));
	return norm > 1e-6 ? out.map((x) => x / norm) : null;
}

export class AcousticSpace {
	static keys: FeatureKey[] = ['f0', 'delta_f', 'hnr', 'balance', 'pitch_span'];
	static raw(f: Features | null | undefined): number[] {
		return AcousticSpace.keys.map((k) => (k === 'f0' ? ((f?.[k] ?? 0) > 0 ? 12 * Math.log2(f![k]!) : NaN) : f?.[k])) as number[];
	}
	static mean(rows: number[][]): number[] {
		return AcousticSpace.keys.map((_, k) => rows.reduce((s, v) => s + v[k], 0) / Math.max(1, rows.length));
	}
	static covariance(rows: number[][]): number[][] {
		const mean = AcousticSpace.mean(rows);
		return AcousticSpace.keys.map((_, i) =>
			AcousticSpace.keys.map((_, j) => rows.reduce((s, v) => s + (v[i] - mean[i]) * (v[j] - mean[j]), 0) / Math.max(1, rows.length - 1))
		);
	}
	center: number[];
	scale: number[];
	mean: number[];
	projections: { variance: Projection; contrast?: Projection };
	constructor(samples: Iterable<Sample>) {
		const rows: number[][] = [],
			labels: number[] = [];
		for (const s of samples) {
			const raw = AcousticSpace.raw(s.features);
			if (raw.every(finite)) {
				rows.push(raw);
				labels.push(s.group === 'female' ? 1 : s.group === 'male' ? 0 : -1);
			}
		}
		this.center = AcousticSpace.keys.map((_, k) => quantile(rows.map((v) => v[k]), 0.5) || 0);
		this.scale = AcousticSpace.keys.map((_, k) =>
			Math.max([1, 30, 2, 2, 1][k], (quantile(rows.map((v) => v[k]), 0.75) - quantile(rows.map((v) => v[k]), 0.25)) / 1.349 || 0)
		);
		const z = rows.map((v) => v.map((x, k) => (x - this.center[k]) / this.scale[k]));
		this.mean = AcousticSpace.keys.map((_, k) => z.reduce((s, v) => s + v[k], 0) / Math.max(1, z.length));
		const centered = z.map((v) => v.map((x, k) => x - this.mean[k]));
		const covariance = AcousticSpace.covariance(centered);
		this.projections = { variance: { axes: eigen(covariance), values: [], bounds: [] } };
		const female = centered.filter((_, i) => labels[i] === 1),
			male = centered.filter((_, i) => labels[i] === 0);
		if (female.length >= 16 && male.length >= 16) {
			const difference = AcousticSpace.mean(female).map((v, k) => v - AcousticSpace.mean(male)[k]);
			if (difference.reduce((s, x) => s + x * x, 0) > 1e-12) {
				const covF = AcousticSpace.covariance(female),
					covM = AcousticSpace.covariance(male);
				const within = covF.map((row, i) => row.map((v, j) => (v + covM[i][j]) / 2 + (i === j ? 1e-6 : 0)));
				let fisher = solve(within, difference);
				const norm = Math.sqrt(fisher.reduce((s, x) => s + x * x, 0));
				if (finite(norm) && norm > 0) {
					fisher = fisher.map((x) => x / norm);
					if (fisher.reduce((s, x, k) => s + x * difference[k], 0) < 0) fisher = fisher.map((x) => -x);
					const axes = [fisher],
						candidates = eigen(within).concat(AcousticSpace.keys.map((_, i) => AcousticSpace.keys.map((_, j) => +(i === j))));
					for (const vector of candidates) {
						const o = orthogonalize(vector, axes);
						if (o) axes.push(o);
						if (axes.length === 5) break;
					}
					if (axes.length === 5) this.projections.contrast = { axes, values: [], bounds: [] };
				}
			}
		}
		for (const p of Object.values(this.projections)) {
			p.values = p.axes.map((axis) => axis.reduce((sum, x, i) => sum + x * axis.reduce((s, y, j) => s + y * covariance[i][j], 0), 0));
			const projected = rows.map((r) => this.projectRaw(r, p.axes));
			p.bounds = [0, 1, 2].map((k) => {
				const vals = projected.map((v) => v[k]);
				const low = quantile(vals, 0.01),
					high = quantile(vals, 0.99),
					pad = Math.max(0.7, (high - low) * 0.28);
				return finite(low) ? [low - pad, high + pad] : [-3, 3];
			});
		}
	}
	standardized(f: Features | null | undefined): number[] | null {
		const v = AcousticSpace.raw(f);
		return v.every(finite) ? v.map((x, k) => (x - this.center[k]) / this.scale[k]) : null;
	}
	projection(name: string): Projection {
		return (this.projections as Record<string, Projection | undefined>)[name] || this.projections.variance;
	}
	projectRaw(raw: number[], axes: number[][]): number[] {
		const z = raw.map((x, k) => (x - this.center[k]) / this.scale[k] - this.mean[k]);
		return axes.map((a) => a.reduce((s, v, k) => s + v * z[k], 0));
	}
	vector(f: Features | null | undefined, name = 'variance'): number[] | null {
		const p = this.projection(name);
		const raw = AcousticSpace.raw(f);
		if (!raw.every(finite)) return null;
		return this.projectRaw(raw, p.axes)
			.slice(0, 3)
			.map((x, k) => (x - p.bounds[k][0]) / (p.bounds[k][1] - p.bounds[k][0]));
	}
	distance(a: Features | null | undefined, b: Features | null | undefined): number {
		const x = this.standardized(a),
			y = this.standardized(b);
		return x && y ? Math.sqrt(x.reduce((s, v, k) => s + (v - y[k]) ** 2, 0)) : Infinity;
	}
	comparison(a: Features, b: Features, dimensions = 3, name = 'variance'): { distance: number; displayedShare: number } | null {
		const p = this.projection(name),
			x = AcousticSpace.raw(a),
			y = AcousticSpace.raw(b);
		if (!x.every(finite) || !y.every(finite)) return null;
		const left = this.projectRaw(x, p.axes),
			right = this.projectRaw(y, p.axes),
			squares = left.map((v, k) => (v - right[k]) ** 2),
			total = squares.reduce((sum, v) => sum + v, 0);
		return { distance: Math.sqrt(total), displayedShare: total > 1e-12 ? squares.slice(0, dimensions).reduce((sum, v) => sum + v, 0) / total : 1 };
	}
	explained(n = 2, name = 'variance'): number {
		const p = this.projection(name);
		return p.values.slice(0, n).reduce((a, b) => a + b, 0) / (this.projections.variance.values.reduce((a, b) => a + b, 0) || 1);
	}
}
