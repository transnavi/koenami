import { finite } from './math';
import type { AcousticSpace, Features } from './space';

/* The share of the closest-to-you order that comes from the timbre descriptor; the five map
   measurements carry the rest. On held-out JVS speakers this mix follows the listeners' similarity
   ratings more closely than the descriptor alone, and finds a speaker's other recordings as often;
   docs/research/ranking.md has the figures. */
export const TIMBRE_WEIGHT = 0.75;

/* Distance from `own` to each speaker's centre in the standardised five-measure space: the mean
   of the speaker's plotted clips, the ones that passed the library's screening and that the timbre
   index also holds. Speakers with no such clip are left out. */
export function fiveMeasureDistances(
	space: AcousticSpace,
	clips: Iterable<{ speaker: string; features: Features; plotted?: boolean }>,
	own: Features | null | undefined
): Map<string, number> {
	const out = new Map<string, number>();
	const q = space.standardized(own);
	if (!q) return out;
	const sums = new Map<string, { sum: number[]; n: number }>();
	for (const c of clips) {
		if (!c.plotted) continue;
		const v = space.standardized(c.features);
		if (!v) continue;
		const s = sums.get(c.speaker) ?? { sum: v.map(() => 0), n: 0 };
		v.forEach((x, k) => (s.sum[k] += x));
		s.n++;
		sums.set(c.speaker, s);
	}
	for (const [speaker, { sum, n }] of sums)
		out.set(speaker, Math.sqrt(sum.reduce((acc, x, k) => acc + (x / n - q[k]) ** 2, 0)));
	return out;
}

function zScores(d: Map<string, number>): Map<string, number> {
	const values = [...d.values()].filter(finite);
	if (values.length < 2) return new Map([...d].map(([k]) => [k, 0]));
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
	return new Map([...d].map(([k, v]) => [k, (v - mean) / sd]));
}

/* One score per speaker the descriptor ranked, lower is closer: both distances z-scored across
   the speakers, then mixed. A take whose five measures are missing is ordered by the descriptor
   alone. A speaker without a five-measure distance keeps its descriptor z-score unweighted, which
   spreads wider than a blend; in the shipped libraries every indexed speaker has one. */
export function blendedScores(
	timbre: Map<string, number>,
	five: Map<string, number>,
	weight = TIMBRE_WEIGHT
): Map<string, number> {
	const t = zScores(timbre);
	const shared = new Map([...five].filter(([k]) => timbre.has(k)));
	const f = shared.size >= 2 ? zScores(shared) : new Map<string, number>();
	return new Map([...t].map(([k, z]) => [k, f.has(k) ? weight * z + (1 - weight) * f.get(k)! : z]));
}
