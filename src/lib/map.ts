import { DensityCloud } from './cloud';
import { finite, quantile, clamp } from './math';
import { m } from './paraglide/messages';
import { AcousticSpace, type Features } from './space';

/* Measured sample positions and time-resolved trajectories share one transform. */
type Vec = number[];
export type TrackRow = { t: number } & Features;
export type MapDetail = { track?: TrackRow[]; duration: number; features?: Features };
export type MapSample = {
	id: string;
	features: Features;
	group?: string | null;
	speaker?: string;
	name?: string;
	recordingId?: string;
	synthetic?: boolean;
	[key: string]: unknown;
};
type Mesh = {
	source: TrackRow[] | undefined;
	stamp: string;
	space: AcousticSpace | null;
	projection: string;
	points: Vec[];
	faces: number[][];
};
type Drag = { x: number; y: number; lastX: number; lastY: number; moved: boolean; pan: boolean };

function hull(points: (Vec | null)[]): Vec[] {
	const p = points
		.filter((p): p is Vec => !!p && p.every(finite))
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (p.length < 3) return p;
	const cross = (a: Vec, b: Vec, c: Vec) =>
		(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	const a: Vec[] = [],
		b: Vec[] = [];
	for (const v of p) {
		while (a.length > 1 && cross(a.at(-2)!, a.at(-1)!, v) <= 0) a.pop();
		a.push(v);
	}
	for (const v of [...p].reverse()) {
		while (b.length > 1 && cross(b.at(-2)!, b.at(-1)!, v) <= 0) b.pop();
		b.push(v);
	}
	return a.slice(0, -1).concat(b.slice(0, -1));
}

export type VoiceMapOptions = {
	/* The tooltip element over the canvas and what to do when the user takes the camera. */
	tooltip: HTMLElement;
	onManual?: () => void;
};

export class VoiceMap {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	onSelect: (sample: MapSample) => void;
	tooltip: HTMLElement;
	onManual?: () => void;
	samples: MapSample[];
	dimension: number;
	projection: string;
	autoRotate: boolean;
	live: boolean;
	liveShapeSeconds: number;
	zoom: number;
	autoFit: boolean;
	camera: Vec;
	center: Vec;
	yaw: number;
	tilt: number;
	hit: { sample: MapSample; xy: Vec }[];
	showRange: boolean;
	dirty: boolean;
	pan: Vec;
	cloud: DensityCloud;
	pointers: Map<number, Vec>;
	drag: Drag | null = null;
	pinch: { distance: number; mid: Vec } | null = null;
	fitDirty = false;
	fitScope: string | undefined;
	navigationVersion: number | undefined;
	space: AcousticSpace | null = null;
	vectorSpace: AcousticSpace | null = null;
	vectorProjection: string | undefined;
	vectorCache: WeakMap<object, Vec | null> | undefined;
	trackCache: WeakMap<object, Partial<Record<'held' | 'plain', TrackRow[]>>> | undefined;
	shapeCache: Partial<Record<'own' | 'ref', Mesh>> | undefined;
	width = 0;
	height = 0;
	colors: Record<string, string> = {};
	selected: MapSample | null = null;
	own: MapDetail | null = null;
	ownFeatures: Features | null = null;
	ownRange: [number, number] | null = null;
	target: MapDetail | null = null;
	targetRange: [number, number] | null = null;
	headPos: Vec | null = null;
	headTarget: Vec | null = null;
	headSeen: number | undefined;
	headAt: number | undefined;
	lastCursor: Vec | null = null;
	constructor(
		canvas: HTMLCanvasElement,
		onSelect: (sample: MapSample) => void,
		{ tooltip, onManual }: VoiceMapOptions
	) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		this.onSelect = onSelect;
		this.tooltip = tooltip;
		this.onManual = onManual;
		this.samples = [];
		this.dimension = 3;
		this.projection = 'variance';
		this.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
		this.live = false;
		this.liveShapeSeconds = 5;
		this.zoom = 1.1;
		this.autoFit = true;
		this.camera = [0.5, 0.5, 0.5];
		this.center = [0.5, 0.5];
		this.yaw = -0.45;
		this.tilt = 0.3;
		this.hit = [];
		this.showRange = true;
		this.dirty = true;
		this.pan = [0, 0];
		this.cloud = new DensityCloud();
		this.pointers = new Map();
		new ResizeObserver(() => {
			if (this.autoFit) this.fitDirty = true;
			this.invalidate();
		}).observe(canvas);
		new MutationObserver(() => this.invalidate()).observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme']
		});
		const position = (e: MouseEvent) => {
			const r = canvas.getBoundingClientRect();
			return [e.clientX - r.left, e.clientY - r.top];
		};
		canvas.addEventListener('contextmenu', (e) => e.preventDefault());
		canvas.addEventListener(
			'wheel',
			(e) => {
				e.preventDefault();
				const delta =
					e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
				this.zoomBy(Math.exp(-clamp(delta, -160, 160) * 0.0025), position(e));
			},
			{ passive: false }
		);
		canvas.addEventListener('pointerdown', (e) => {
			if (e.button > 2) return;
			const [x, y] = position(e);
			this.pointers.set(e.pointerId, [x, y]);
			this.drag = {
				x,
				y,
				lastX: x,
				lastY: y,
				moved: false,
				pan: e.shiftKey || e.button === 1 || e.button === 2
			};
			this.pinch = null;
			canvas.setPointerCapture(e.pointerId);
			this.tooltip.hidden = true;
		});
		canvas.addEventListener('pointermove', (e) => {
			const [x, y] = position(e);
			if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, [x, y]);
			if (this.drag) {
				const d = this.drag;
				if (this.pointers.size === 2) {
					const [a, b] = [...this.pointers.values()],
						mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
						distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
					if (this.pinch) {
						this.manual();
						this.zoomBy(distance / Math.max(1, this.pinch.distance), mid);
						this.pan[0] += mid[0] - this.pinch.mid[0];
						this.pan[1] += mid[1] - this.pinch.mid[1];
						this.invalidate();
					}
					this.pinch = { distance, mid };
					d.moved = true;
					return;
				}
				d.moved ||= Math.hypot(x - d.x, y - d.y) > 4;
				if (d.moved) {
					this.manual();
					const dx = x - d.lastX,
						dy = y - d.lastY;
					if (this.dimension === 3 && !d.pan) {
						this.yaw += dx * 0.006;
						this.tilt = clamp(this.tilt + dy * 0.006, -1.45, 1.45);
					} else {
						this.pan[0] += dx;
						this.pan[1] += dy;
					}
					this.invalidate();
				}
				d.lastX = x;
				d.lastY = y;
				return;
			}
			const point = this.pick(x, y),
				tip = this.tooltip;
			if (point) {
				tip.textContent = `${point.name || point.speaker} · ${Math.round(point.features.f0 as number)} Hz`;
				tip.style.left = clamp(x + 12, 0, this.width - 190) + 'px';
				tip.style.top = Math.max(0, y - 32) + 'px';
				tip.hidden = false;
			} else tip.hidden = true;
		});
		const release = (e: PointerEvent) => {
			const [x, y] = position(e);
			if (e.type === 'pointerup' && this.drag && !this.drag.moved) {
				const p = this.pick(x, y);
				if (p) this.onSelect(p);
			}
			this.pointers.delete(e.pointerId);
			this.pinch = null;
			if (this.pointers.size) {
				const [a, b] = [...this.pointers.values()][0];
				this.drag = { x: a, y: b, lastX: a, lastY: b, moved: true, pan: false };
			} else this.drag = null;
		};
		canvas.addEventListener('pointerup', release);
		canvas.addEventListener('pointercancel', release);
		canvas.addEventListener('pointerleave', () => (this.tooltip.hidden = true));
		canvas.addEventListener('keydown', (e) => {
			if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(e.key)) {
				e.preventDefault();
				if (e.key === '0') this.reset();
				else if (['+', '=', '-'].includes(e.key)) this.zoomBy(e.key === '-' ? 1 / 1.2 : 1.2);
				else {
					this.manual();
					const x = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0,
						y = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
					if (this.dimension === 3 && !e.shiftKey) {
						this.yaw += x * 0.1;
						this.tilt = clamp(this.tilt + y * 0.1, -1.45, 1.45);
					} else {
						this.pan[0] += x * 20;
						this.pan[1] -= y * 20;
					}
				}
				this.invalidate();
			}
		});
	}
	invalidate() {
		this.dirty = true;
	}
	setSamples(s: MapSample[]) {
		this.samples = s;
		this.invalidate();
	}
	manual() {
		this.navigationVersion = (this.navigationVersion || 0) + 1;
		this.autoFit = false;
		this.autoRotate = false;
		this.onManual?.();
	}
	reset() {
		this.fitScope = 'all';
		this.fitDirty = true;
		this.autoFit = true;
		this.pan = [0, 0];
		this.camera = [0.5, 0.5, 0.5];
		this.center = [0.5, 0.5];
		this.yaw = -0.45;
		this.tilt = 0.3;
		this.invalidate();
	}
	zoomBy(f: number, anchor: Vec = [this.width / 2, this.height / 2]) {
		this.navigationVersion = (this.navigationVersion || 0) + 1;
		this.autoFit = false;
		const previous = this.zoom;
		this.zoom = clamp(previous * f, 0.15, 12);
		const ratio = this.zoom / previous;
		this.pan = this.pan.map(
			(p, k) => (anchor[k] - [this.width / 2, this.height / 2][k]) * (1 - ratio) + p * ratio
		);
		this.invalidate();
	}
	vector(f: Features | null | undefined): Vec | null {
		if (!f || !this.space) return null;
		if (this.vectorSpace !== this.space || this.vectorProjection !== this.projection) {
			this.vectorCache = new WeakMap();
			this.vectorSpace = this.space;
			this.vectorProjection = this.projection;
		}
		if (this.vectorCache!.has(f)) return this.vectorCache!.get(f)!;
		const v = this.space.vector(f, this.projection);
		this.vectorCache!.set(f, v);
		return v;
	}
	project(v: Vec | null): Vec | null {
		if (!v) return null;
		const w = this.width - 48,
			h = this.height - 48,
			cx = this.width / 2 + this.pan[0],
			cy = this.height / 2 + this.pan[1];
		if (this.dimension === 2)
			return [
				cx + (v[0] - this.center[0]) * w * this.zoom,
				cy - (v[1] - this.center[1]) * h * this.zoom,
				0
			];
		const x = v[0] - (this.camera?.[0] ?? 0.5),
			y = v[1] - (this.camera?.[1] ?? 0.5),
			z = v[2] - (this.camera?.[2] ?? 0.5),
			u = x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
			d = -x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
			yy = y * Math.cos(this.tilt) - d * Math.sin(this.tilt),
			dd = y * Math.sin(this.tilt) + d * Math.cos(this.tilt),
			s = Math.min(w, h) * 0.86 * this.zoom;
		return [cx + u * s, cy - yy * s, dd];
	}
	pick(x: number, y: number): MapSample | null {
		let best: MapSample | null = null,
			dist = 12;
		for (const p of this.hit) {
			const d = Math.hypot(p.xy[0] - x, p.xy[1] - y);
			if (d < dist) {
				best = p.sample;
				dist = d;
			}
		}
		return best;
	}
	smoothTrack(detail: MapDetail | null, range: [number, number] | null, hold = false): TrackRow[] {
		if (!detail?.track) return [];
		this.trackCache ||= new WeakMap();
		const cached = this.trackCache.get(detail.track) || {};
		let smooth = cached[hold ? 'held' : 'plain'];
		if (!smooth) {
			const reach = hold ? 3 : 1.2;
			smooth = detail.track.map((row, i, all) => {
				if (!finite(row.f0)) return { t: row.t };
				const near: TrackRow[] = [],
					held: TrackRow[] = [];
				for (let j = i; j >= 0 && row.t - all[j].t <= reach; j--)
					if (finite(all[j].f0)) {
						held.push(all[j]);
						if (row.t - all[j].t <= 1.2) near.push(all[j]);
					}
				if (near.length < 8) return { t: row.t };
				// Live view: resonance is measured far less often than pitch, so its last readings are held for up to 3 s to keep the point moving.
				const f: TrackRow = { t: row.t };
				for (const k of AcousticSpace.keys) {
					let values = near.map((p) => p[k]).filter(finite);
					if (hold && values.length < 4)
						values = held
							.map((p) => p[k])
							.filter(finite)
							.slice(0, 4);
					f[k] = values.length >= (hold && k === 'delta_f' ? 2 : 4) ? quantile(values, 0.5) : null;
				}
				return f;
			});
			this.trackCache.set(detail.track, { ...cached, [hold ? 'held' : 'plain']: smooth });
		}
		return range ? smooth.filter((p) => p.t >= range[0] && p.t <= range[1]) : smooth;
	}
	cursor(track: TrackRow[], t: number | undefined): Vec | null {
		if (!track.length || !finite(t)) return null;
		let lo = 0,
			hi = track.length - 1;
		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if (track[mid].t < t) lo = mid + 1;
			else hi = mid;
		}
		const b = track[lo],
			a = track[Math.max(0, lo - 1)],
			av = this.vector(a),
			bv = this.vector(b);
		if (av && bv && b.t - a.t <= 0.2 && t >= a.t && t <= b.t) {
			const r = (t - a.t) / (b.t - a.t || 1);
			return av.map((v, i) => v + (bv[i] - v) * r);
		}
		for (let i = lo; i >= 0 && t - track[i].t < 0.22; i--)
			if (track[i].t <= t && this.vector(track[i])) return this.vector(track[i]);
		return null;
	}
	draw(time: { own?: number; target?: number; animate?: boolean } = {}) {
		if (!this.dirty && !time.animate) return;
		this.dirty = false;
		const c = this.canvas,
			g = this.ctx,
			dpr = Math.min(devicePixelRatio || 1, 2);
		this.width = c.clientWidth;
		this.height = c.clientHeight;
		if (!this.width || !this.height) return;
		if (c.width !== Math.round(this.width * dpr) || c.height !== Math.round(this.height * dpr)) {
			c.width = Math.round(this.width * dpr);
			c.height = Math.round(this.height * dpr);
		}
		g.setTransform(dpr, 0, 0, dpr, 0, 0);
		g.clearRect(0, 0, this.width, this.height);
		const css = getComputedStyle(document.documentElement),
			color = (k: string) => css.getPropertyValue(k).trim();
		this.colors = {
			female: color('--pink'),
			male: color('--sky'),
			synthetic: color('--purple'),
			research: color('--purple'),
			custom: color('--purple'),
			own: color('--self'),
			'own-history': color('--self'),
			target: color('--reference'),
			grid: color('--grid'),
			text: color('--muted'),
			bg: color('--bg')
		};
		g.font = '10px "Segoe UI",sans-serif';
		this.axes();
		g.save();
		this.hit = [];
		const samples = this.samples
			.map((s) => ({ sample: s, xy: this.project(this.vector(s.features)) }))
			.filter((p): p is { sample: MapSample; xy: Vec } => !!p.xy)
			.sort((a, b) => a.xy[2] - b.xy[2]);
		this.cloud.draw(g, samples as never, {
			width: this.width,
			height: this.height,
			scale: Math.min(this.width - 48, this.height - 48) * 0.86 * this.zoom,
			colors: this.colors,
			dark: document.documentElement.dataset.theme === 'dark'
		});
		for (const p of samples) {
			if (p.xy[0] < 0 || p.xy[0] > this.width || p.xy[1] < 0 || p.xy[1] > this.height) continue;
			this.hit.push(p);
			g.globalAlpha = p.sample.recordingId ? 0.65 : 0.3;
			g.fillStyle = this.colors[p.sample.group as string] || this.colors.research;
			g.beginPath();
			g.arc(p.xy[0], p.xy[1], p.sample.recordingId ? 4 : 2.2, 0, Math.PI * 2);
			g.fill();
			if (p.sample.recordingId) {
				g.strokeStyle = this.colors.bg;
				g.lineWidth = 1.5;
				g.stroke();
			}
		}
		g.globalAlpha = 1;
		this.trajectory(this.target, this.targetRange, this.colors.target, time.target, false);
		this.trajectory(this.own, this.ownRange, this.colors.own, time.own, true);
		for (const [features, color, own] of [
			[this.selected?.features, this.colors.target, false],
			[this.ownFeatures || this.own?.features, this.colors.own, true]
		] as [Features | undefined, string, boolean][]) {
			const p = this.project(this.vector(features));
			if (p) {
				const active = finite(own ? time.own : time.target);
				this.ctx.globalAlpha = active ? 0.25 : 1;
				this.marker(p, color, own ? 8 : 7, own);
				this.ctx.globalAlpha = 1;
				if (!active) this.label(p, own ? m.common_self() : m.common_reference(), color);
			}
		}
		g.restore();
		if (this.dimension === 3) this.fitShapes();
	}
	marker(p: Vec, color: string, r: number, diamond = false) {
		const g = this.ctx;
		g.beginPath();
		if (diamond) {
			g.moveTo(p[0], p[1] - r);
			g.lineTo(p[0] + r, p[1]);
			g.lineTo(p[0], p[1] + r);
			g.lineTo(p[0] - r, p[1]);
			g.closePath();
		} else g.arc(p[0], p[1], r, 0, Math.PI * 2);
		g.fillStyle = color;
		g.fill();
		g.strokeStyle = this.colors.bg;
		g.lineWidth = 2;
		g.stroke();
	}
	shape(track: TrackRow[], color: string, own: boolean, quiet = false) {
		this.shapeCache ||= {};
		const side = own ? 'own' : 'ref',
			source = (own ? this.own : this.target)?.track,
			stamp = track[0]?.t + ':' + track.at(-1)?.t;
		let mesh = this.shapeCache[side];
		if (
			!mesh ||
			mesh.source !== source ||
			mesh.stamp !== stamp ||
			mesh.space !== this.space ||
			mesh.projection !== this.projection
		) {
			const rows = track
				.map((p) => ({ point: this.vector(p), z: this.space?.standardized(p) }))
				.filter((r): r is { point: Vec; z: Vec } => !!r.point && !!r.z);
			if (rows.length < 6) {
				delete this.shapeCache[side];
				return;
			}
			// Main 80% of voiced windows in the full feature space; no display-size cap.
			const center = AcousticSpace.keys.map((_, k) =>
				quantile(
					rows.map((r) => r.z[k]),
					0.5
				)
			);
			rows.sort(
				(a, b) =>
					a.z.reduce((s, v, k) => s + (v - center[k]) ** 2, 0) -
					b.z.reduce((s, v, k) => s + (v - center[k]) ** 2, 0)
			);
			const inside = rows.slice(0, Math.max(6, Math.ceil(rows.length * 0.8))).map((r) => r.point),
				points: Vec[] = [];
			for (let i = 0; i < inside.length; i += Math.max(1, Math.floor(inside.length / 180)))
				points.push(inside[i]);
			const anchor =
				this.live && own ? null : this.vector(own ? this.ownFeatures : this.selected?.features);
			if (anchor) points.push(anchor);
			for (let k = 0; k < 3; k++)
				for (const sign of [-1, 1]) {
					let best = inside[0];
					for (const p of inside) if (sign * p[k] > sign * best[k]) best = p;
					if (best) points.push(best);
				}
			mesh = {
				source,
				stamp,
				space: this.space,
				projection: this.projection,
				points,
				faces: convex3(points)
			};
			this.shapeCache[side] = mesh;
			this.fitDirty = true;
		}
		const pts = mesh.points.map((p) => this.project(p)),
			edge = hull(pts),
			g = this.ctx;
		if (edge.length < 3) return;
		g.save();
		g.fillStyle = color;
		g.strokeStyle = color;
		g.beginPath();
		edge.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
		g.closePath();
		g.globalAlpha = quiet ? 0.04 : 0.075;
		g.fill();
		g.lineWidth = quiet ? 1 : own ? 2.2 : 1.8;
		g.globalAlpha = quiet ? 0.25 : 0.9;
		g.setLineDash(own ? [6, 4] : []);
		g.stroke();
		if (quiet) {
			g.restore();
			return;
		}
		g.lineWidth = 0.6;
		g.globalAlpha = 0.14;
		g.setLineDash([]);
		const seen = new Set<string>();
		for (const face of mesh.faces)
			for (let i = 0; i < 3; i++) {
				const a = face[i],
					b = face[(i + 1) % 3],
					key = [a, b].sort((x, y) => x - y).join(':');
				if (seen.has(key)) continue;
				seen.add(key);
				g.beginPath();
				g.moveTo(pts[a]![0], pts[a]![1]);
				g.lineTo(pts[b]![0], pts[b]![1]);
				g.stroke();
			}
		g.restore();
	}
	fitShapes() {
		if (!this.autoFit || !this.fitDirty || this.drag) return;
		let points = Object.values(this.shapeCache || {}).flatMap((shape) => shape?.points || []);
		for (const f of [this.ownFeatures, this.selected?.features]) {
			const p = this.vector(f);
			if (p) points.push(p);
		}
		if (this.fitScope !== 'voices' || points.length < 4) {
			const background = this.samples
					.map((p) => this.vector(p.features))
					.filter((v): v is Vec => !!v),
				limits = [0, 1, 2].map((k) => [
					quantile(
						background.map((v) => v[k]),
						0.08
					),
					quantile(
						background.map((v) => v[k]),
						0.92
					)
				]);
			points = points.concat(
				background.filter((p) => p.every((v, k) => v >= limits[k][0] && v <= limits[k][1]))
			);
		}
		if (!points.length) return;
		const center = [0, 1, 2].map(
			(k) => (Math.min(...points.map((p) => p[k])) + Math.max(...points.map((p) => p[k]))) / 2
		);
		// A bounding sphere has the same radius at every rotation: orbiting cannot rescale it.
		const radius = Math.max(
			0.16,
			...points.map((p) => Math.hypot(...p.map((v, k) => v - center[k])))
		);
		this.camera = center;
		this.pan = [0, 0];
		this.zoom = clamp(0.49 / radius, 0.15, 6);
		this.fitDirty = false;
		this.invalidate();
	}
	label(p: Vec, text: string, color: string) {
		const g = this.ctx;
		g.font = '11px system-ui';
		g.textAlign = 'left';
		const width = g.measureText(text).width;
		const x = clamp(p[0] + 14, 46, this.width - width - 30),
			y = clamp(p[1] - 14, 22, this.height - 62);
		g.fillStyle = this.colors.bg;
		g.globalAlpha = 0.94;
		g.fillRect(x - 4, y - 13, width + 8, 19);
		g.globalAlpha = 1;
		g.fillStyle = color;
		g.fillText(text, x, y);
	}
	trajectory(
		detail: MapDetail | null,
		range: [number, number] | null,
		color: string,
		time: number | undefined,
		own: boolean
	) {
		const live = this.live && own;
		if (own && !live) {
			this.headPos = this.headTarget = null;
			this.headSeen = undefined;
		}
		const track = this.smoothTrack(detail, range, live);
		if (!track.length) {
			if (this.shapeCache) {
				delete this.shapeCache[own ? 'own' : 'ref'];
				this.fitDirty = true;
			}
			return;
		}
		const seconds = this.liveShapeSeconds,
			end = Math.floor((finite(time) ? time : detail!.duration) * 10) / 10;
		const visible = live ? track.filter((p) => p.t > end - seconds && p.t <= end) : track;
		const points = visible.map((p) => this.project(this.vector(p))).filter(Boolean),
			g = this.ctx;
		if (this.showRange && points.length > 3) this.shape(visible, color, own, live);
		else if (this.shapeCache) delete this.shapeCache[own ? 'own' : 'ref'];
		if (!finite(time)) return;
		if (live) {
			this.comet(visible, color, time, seconds);
			this.head(track, time, color, seconds);
			return;
		}
		let last: { p: Vec; t: number } | null = null;
		for (const row of visible) {
			if (row.t < time - 1.4) continue;
			if (row.t > time) break;
			const p = this.project(this.vector(row));
			if (!p) {
				last = null;
				continue;
			}
			const age = clamp(1 - (time - row.t) / 1.4, 0, 1);
			g.globalAlpha = age ** 1.5;
			g.strokeStyle = color;
			g.fillStyle = color;
			g.lineWidth = 1 + age * 3;
			if (last && row.t - last.t < 0.2) {
				g.beginPath();
				g.moveTo(last.p[0], last.p[1]);
				g.lineTo(p[0], p[1]);
				g.stroke();
			}
			g.beginPath();
			g.arc(p[0], p[1], 1 + age * 2.2, 0, Math.PI * 2);
			g.fill();
			last = { p, t: row.t };
		}
		g.globalAlpha = 1;
		const cursor = this.project(this.cursor(track, time));
		if (cursor) {
			g.fillStyle = color;
			g.globalAlpha = 0.15;
			g.beginPath();
			g.arc(cursor[0], cursor[1], 17, 0, Math.PI * 2);
			g.fill();
			g.globalAlpha = 1;
			this.marker(cursor, color, 9, own);
			this.label(cursor, own ? m.common_self() : m.common_reference(), color);
			if (own) this.lastCursor = cursor;
		} else if (own) this.lastCursor = null;
	}
	/* Live view: one trail over the whole window. Older speech fades and thins; a soft glow accumulates where the voice has been. */
	comet(rows: TrackRow[], color: string, time: number, seconds: number) {
		const g = this.ctx,
			path: { p: Vec; t: number; age: number }[] = [];
		for (const row of rows) {
			if (row.t > time) break;
			const p = this.project(this.vector(row));
			if (!p) continue;
			path.push({ p, t: row.t, age: clamp(1 - (time - row.t) / seconds, 0, 1) });
		}
		if (!path.length) return;
		g.save();
		g.globalCompositeOperation = 'lighter';
		for (let i = 0; i < path.length; i += 2) {
			const { p, age } = path[i],
				r = 10 + 8 * age;
			const glow = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
			glow.addColorStop(0, color);
			glow.addColorStop(1, 'transparent');
			g.globalAlpha = 0.05 * age;
			g.fillStyle = glow;
			g.beginPath();
			g.arc(p[0], p[1], r, 0, Math.PI * 2);
			g.fill();
		}
		g.restore();
		g.strokeStyle = color;
		g.lineCap = 'round';
		g.lineJoin = 'round';
		for (let i = 1; i < path.length; i++) {
			const a = path[i - 1],
				b = path[i],
				pause = b.t - a.t > 0.3;
			g.setLineDash(pause ? [2, 5] : []);
			g.globalAlpha = (pause ? 0.3 : 1) * (0.06 + 0.94 * b.age ** 2.2);
			g.lineWidth = pause ? 1 : 0.5 + 3.5 * b.age ** 1.5;
			g.beginPath();
			g.moveTo(a.p[0], a.p[1]);
			g.lineTo(b.p[0], b.p[1]);
			g.stroke();
		}
		g.setLineDash([]);
		g.globalAlpha = 1;
	}
	/* The head eases toward the newest measurement and stays put, fading, through pauses. */
	head(track: TrackRow[], time: number, color: string, seconds: number) {
		const g = this.ctx,
			now = performance.now(),
			dt = Math.min(0.1, (now - (this.headAt || now)) / 1000);
		this.headAt = now;
		if (finite(this.headSeen) && time < this.headSeen - 1) {
			this.headPos = this.headTarget = null;
			this.headSeen = undefined;
		}
		const target = this.project(this.cursor(track, time));
		if (target) {
			this.headSeen = time;
			this.headTarget = target;
		}
		const silent = finite(this.headSeen) ? time - this.headSeen : Infinity;
		if (!this.headTarget || silent > seconds) {
			this.lastCursor = null;
			return;
		}
		const k = 1 - Math.exp(-dt / 0.12);
		this.headPos = this.headPos
			? this.headPos.map((v, i) => v + (this.headTarget![i] - v) * k)
			: this.headTarget.slice(0, 2);
		const p = this.headPos,
			fade = clamp(1 - silent / seconds, 0, 1),
			alpha = 0.35 + 0.65 * fade;
		g.fillStyle = color;
		g.globalAlpha = 0.15 * alpha;
		g.beginPath();
		g.arc(p[0], p[1], 17, 0, Math.PI * 2);
		g.fill();
		g.globalAlpha = alpha;
		this.marker(p, color, 9, true);
		g.globalAlpha = 1;
		if (fade > 0.5) this.label(p, m.common_self(), color);
		this.lastCursor = p;
	}
	axes() {
		const g = this.ctx,
			c = this.colors;
		g.strokeStyle = c.grid;
		g.fillStyle = c.text;
		g.lineWidth = 1;
		if (this.dimension === 2) {
			for (let i = 0; i <= 4; i++) {
				const t = i / 4,
					a = this.project([t, 0, 0.5])!,
					b = this.project([t, 1, 0.5])!,
					d = this.project([0, t, 0.5])!,
					e = this.project([1, t, 0.5])!;
				g.beginPath();
				g.moveTo(a[0], a[1]);
				g.lineTo(b[0], b[1]);
				g.moveTo(d[0], d[1]);
				g.lineTo(e[0], e[1]);
				g.stroke();
			}
		} else
			for (const [a, b] of [
				[
					[0, 0, 0],
					[1, 0, 0]
				],
				[
					[0, 0, 0],
					[0, 1, 0]
				],
				[
					[0, 0, 0],
					[0, 0, 1]
				],
				[
					[1, 0, 0],
					[1, 1, 0]
				],
				[
					[0, 1, 0],
					[1, 1, 0]
				],
				[
					[0, 0, 1],
					[1, 0, 1]
				],
				[
					[1, 0, 0],
					[1, 0, 1]
				],
				[
					[0, 0, 1],
					[0, 1, 1]
				],
				[
					[0, 1, 0],
					[0, 1, 1]
				],
				[
					[1, 1, 0],
					[1, 1, 1]
				],
				[
					[0, 1, 1],
					[1, 1, 1]
				],
				[
					[1, 0, 1],
					[1, 1, 1]
				]
			]) {
				const p = this.project(a)!,
					q = this.project(b)!;
				g.beginPath();
				g.moveTo(p[0], p[1]);
				g.lineTo(q[0], q[1]);
				g.stroke();
			}
		g.textAlign = 'center';
		g.font = '10px system-ui';
	}
}

function convex3(p: Vec[]): number[][] {
	if (p.length < 4) return [];
	const sub = (a: Vec, b: Vec) => a.map((v, i) => v - b[i]),
		cross = (a: Vec, b: Vec) => [
			a[1] * b[2] - a[2] * b[1],
			a[2] * b[0] - a[0] * b[2],
			a[0] * b[1] - a[1] * b[0]
		],
		dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
	const a = 0,
		b = p.reduce(
			(best, v, i) =>
				dot(sub(v, p[a]), sub(v, p[a])) > dot(sub(p[best], p[a]), sub(p[best], p[a])) ? i : best,
			1
		),
		ab = sub(p[b], p[a]);
	const c = p.reduce(
			(best, v, i) =>
				Math.hypot(...cross(ab, sub(v, p[a]))) > Math.hypot(...cross(ab, sub(p[best], p[a])))
					? i
					: best,
			0
		),
		normal = cross(ab, sub(p[c], p[a]));
	const d = p.reduce(
		(best, v, i) =>
			Math.abs(dot(normal, sub(v, p[a]))) > Math.abs(dot(normal, sub(p[best], p[a]))) ? i : best,
		0
	);
	if (new Set([a, b, c, d]).size < 4 || Math.abs(dot(normal, sub(p[d], p[a]))) < 1e-10) return [];
	const interior = [0, 1, 2].map((k) => (p[a][k] + p[b][k] + p[c][k] + p[d][k]) / 4),
		orient = (f: number[]) => {
			if (dot(cross(sub(p[f[1]], p[f[0]]), sub(p[f[2]], p[f[0]])), sub(interior, p[f[0]])) > 0)
				[f[1], f[2]] = [f[2], f[1]];
			return f;
		};
	let faces = [
		[a, b, c],
		[a, b, d],
		[a, c, d],
		[b, c, d]
	].map(orient);
	for (let i = 0; i < p.length; i++) {
		const visible = faces.filter(
			(f) => dot(cross(sub(p[f[1]], p[f[0]]), sub(p[f[2]], p[f[0]])), sub(p[i], p[f[0]])) > 1e-9
		);
		if (!visible.length) continue;
		const edges = new Map<string, number[]>();
		for (const f of visible)
			for (let j = 0; j < 3; j++) {
				const edge = [f[j], f[(j + 1) % 3]],
					key = [...edge].sort((a, b) => a - b).join(':');
				if (edges.has(key)) edges.delete(key);
				else edges.set(key, edge);
			}
		faces = faces.filter((f) => !visible.includes(f));
		for (const [a, b] of edges.values()) faces.push(orient([a, b, i]));
	}
	return faces;
}
