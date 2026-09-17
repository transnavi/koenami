export const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export const quantile = (a: number[], p: number): number => {
	if (!a.length) return NaN;
	const b = [...a].sort((x, y) => x - y),
		i = (b.length - 1) * p;
	return b[Math.floor(i)] + (b[Math.ceil(i)] - b[Math.floor(i)]) * (i % 1);
};
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export type Axis = {
	label: string;
	unit: string;
	min: number;
	max: number;
	log?: boolean;
	ticks: number[];
};
export const AXES: Record<'f0' | 'delta_f' | 'hnr' | 'balance' | 'pitch_span', Axis> = {
	f0: { label: 'Pitch', unit: 'Hz', min: 65, max: 500, log: true, ticks: [80, 120, 180, 260, 380] },
	delta_f: {
		label: 'Resonance',
		unit: 'Hz ΔF',
		min: 650,
		max: 1500,
		ticks: [700, 900, 1100, 1300, 1500]
	},
	hnr: { label: 'Texture', unit: 'dB HNR', min: -5, max: 30, ticks: [0, 10, 20, 30] },
	balance: { label: 'Balance', unit: 'dB', min: -40, max: 5, ticks: [-40, -30, -20, -10, 0] },
	pitch_span: { label: 'Variation', unit: 'st', min: 0, max: 22, ticks: [0, 5, 10, 15, 20] }
};
