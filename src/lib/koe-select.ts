/* <koe-select>: the studio's popover select, a custom element with the options as light-DOM
   <option> children and the trigger and list in its shadow root. A light-DOM
   <template data-menu-header> child (the recording menu's sort control) is cloned above the
   items in the list and exposed as `header`; its parts are styled from the page. */
import { t } from './i18n';
let menuId = 0;
/* The take rows' waveform preview: `peaks` are 0…1 bucket maxima, drawn as centred bars
   across the row's width. Bars up to `progress` (0…1) are the accent colour, the rest muted,
   so a playing take shows how far it has got. */
const drawWave = (canvas: HTMLCanvasElement, peaks: number[], progress = 0) => {
	const w = canvas.clientWidth || 208,
		h = 17,
		dpr = canvas.ownerDocument?.defaultView?.devicePixelRatio || 1;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	const g = canvas.getContext('2d')!;
	g.scale(dpr, dpr);
	const styles = getComputedStyle(canvas),
		muted = styles.getPropertyValue('--muted').trim() || styles.color,
		played = styles.getPropertyValue('--accent').trim() || muted;
	const n = peaks.length,
		step = w / n;
	for (let i = 0; i < n; i++) {
		const bar = Math.max(1, peaks[i] * h);
		g.fillStyle = (i + 1) * step <= progress * w ? played : muted;
		g.fillRect(i * step, (h - bar) / 2, Math.max(1, step * 0.66), bar);
	}
};
type RowPlaying = { playing: boolean; progress: number };
// A wave button's peaks, parsed once at render rather than on every progress tick.
const wavePeaksOf = new WeakMap<HTMLElement, number[]>();
/* Paints a wave button's playing state: the glyph (play or stop), its label, and the bars
   repainted up to the progress. */
const applyRowPlaying = (wave: HTMLElement, playing: boolean, progress = 0) => {
	wave.classList.toggle('playing', playing);
	const path = wave.querySelector('.glyph path');
	if (path) path.setAttribute('d', playing ? 'M5 5h10v10H5z' : 'M7 4l9 6-9 6z');
	wave.title = playing ? t('action.stop') : t('action.play');
	wave.setAttribute(
		'aria-label',
		playing ? wave.dataset.stopLabel || '' : wave.dataset.playLabel || ''
	);
	const canvas = wave.querySelector('canvas');
	const peaks = wavePeaksOf.get(wave);
	if (canvas && peaks) queueMicrotask(() => drawWave(canvas, peaks, progress));
};
/* The element's interface for callers; the class itself is created on registration, so the
   module also loads where HTMLElement does not exist (prerendering). */
export interface KoeSelectElement extends HTMLElement {
	value: string;
	disabled: boolean;
	readonly options: HTMLOptionElement[];
	/** The menu's header, cloned from a `<template data-menu-header>` child, or null. */
	readonly header: HTMLElement | null;
	add(option: HTMLOptionElement): void;
	open(direction?: number): void;
	close(): void;
	setRowPlaying(key: string, playing: boolean, progress?: number): void;
}
/* Registers the element. A page that uses it calls this once it runs in the browser, before it
   wires the elements. Every route is its own document (see app.html), so the guard only
   matters when a page mounts twice in one document, as under HMR in vite dev. */
export function defineKoeSelect() {
	if (customElements.get('koe-select')) return;
	class KoeSelect extends HTMLElement {
		_value: string | null;
		_editing = false;
		_rowPlaying: Record<string, RowPlaying> | undefined;
		_disabled: boolean;
		active: number;
		uid: string;
		trigger!: HTMLButtonElement;
		list!: HTMLDivElement;
		items!: HTMLDivElement;
		header: HTMLElement | null = null;
		observer?: MutationObserver;
		constructor() {
			super();
			this.attachShadow({ mode: 'open' });
			this._value = null;
			this._disabled = false;
			this.active = 0;
			this.uid = 'choice-' + ++menuId;
		}
		connectedCallback() {
			this.style.display = 'inline-flex';
			this.shadowRoot!.innerHTML = `<style>:host{position:relative;min-width:0;color:var(--ink);font:inherit}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.trigger{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;height:100%;min-height:28px;padding:5px 8px;background:var(--surface);border:1px solid var(--line);border-radius:6px;font-size:inherit;text-align:left}.trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.icon{width:16px;height:16px;flex-shrink:0;color:var(--muted);fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.trigger:after{content:'';width:5px;height:5px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(45deg);margin:0 3px 3px 0;flex-shrink:0}.trigger:disabled{opacity:.4;cursor:default}.list{position:fixed;inset:auto;margin:0;padding:4px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow);min-width:120px;max-height:min(320px,55vh);overflow:auto;scrollbar-width:thin;scrollbar-color:var(--muted) transparent;overscroll-behavior:contain;z-index:1000}.list::-webkit-scrollbar{width:7px}.list::-webkit-scrollbar-track{background:transparent}.list::-webkit-scrollbar-thumb{background:var(--muted);border:2px solid var(--surface);border-radius:8px}.list::-webkit-scrollbar-button{display:none}.list[role=menu]{width:min(340px,calc(100vw - 24px));max-height:min(420px,65vh);padding:6px}.choice-row+.choice-row{margin-top:2px}.item{display:block;border:0;background:transparent;padding:8px 10px;width:100%;text-align:left;white-space:nowrap;border-radius:5px;font-size:12px}.item:hover,.item:focus{background:var(--raised);outline:0}.item[aria-selected=true],.item[aria-checked=true]{background:var(--selected);color:var(--accent)}.item:disabled{opacity:.4}.item .detail{color:var(--muted);font-size:10px;margin-left:7px;font-variant-numeric:tabular-nums}.item.divider{border-top:1px solid var(--line);border-radius:0;margin-top:5px;padding-top:12px}.choice-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:2px;max-width:min(400px,calc(100vw - 24px))}.choice-row .item{grid-column:1;grid-row:1;min-width:0;width:auto;overflow:hidden;text-overflow:ellipsis}.choice-row .rename{grid-column:1;grid-row:1;min-width:0;width:100%;font:inherit;font-size:12px;color:var(--ink);background:var(--surface);border:1px solid var(--accent);border-radius:5px;padding:5px 7px}.choice-row .row-actions{grid-column:2;grid-row:1;display:flex}.choice-row .row-action{width:28px;height:28px;padding:4px}.row-action{display:grid;place-items:center;flex-shrink:0;border:0;border-radius:5px;background:transparent;color:var(--muted)}.row-action:hover,.row-action:focus-visible{background:var(--raised);color:var(--accent)}.row-action[data-action=delete]:hover,.row-action[data-action=delete]:focus-visible{color:var(--danger)}.row-action:disabled{opacity:.3;cursor:default}.row-action svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.choice-row .wave{grid-column:1/-1;grid-row:2;display:flex;align-items:center;gap:6px;border:0;background:transparent;border-radius:5px;padding:1px 2px 3px;width:100%;height:21px}.wave:disabled{opacity:.35;cursor:default}.wave canvas{display:block;flex:1;min-width:0;height:17px}.wave .glyph{flex-shrink:0;width:16px;height:16px;color:var(--muted);fill:currentColor;stroke:none;transition:color .12s}.wave:hover:not(:disabled) .glyph,.wave:focus-visible .glyph,.wave.playing .glyph{color:var(--accent)}</style><button part="trigger" class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${this.uid}"><span></span></button><div class="list" id="${this.uid}" role="listbox" popover="auto"><div class="items"></div></div>`;
			this.trigger = this.shadowRoot!.querySelector('.trigger')!;
			const symbol =
				this.getAttribute('icon') && document.getElementById(this.getAttribute('icon')!);
			if (symbol) {
				const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
				icon.setAttribute('class', 'icon');
				icon.setAttribute('viewBox', symbol.getAttribute('viewBox')!);
				icon.setAttribute('aria-hidden', 'true');
				icon.innerHTML = symbol.innerHTML;
				this.trigger.prepend(icon);
			}
			this.list = this.shadowRoot!.querySelector('.list')!;
			this.items = this.list.querySelector('.items')!;
			const header = this.querySelector<HTMLTemplateElement>('template[data-menu-header]');
			if (header?.content.firstElementChild) {
				this.header = header.content.firstElementChild.cloneNode(true) as HTMLElement;
				this.list.prepend(this.header);
			}
			this.trigger.onclick = () =>
				this.list.matches(':popover-open') ? this.close() : this.open();
			this.list.addEventListener('toggle', () => {
				this.trigger.setAttribute('aria-expanded', String(this.list.matches(':popover-open')));
			});
			this.trigger.onkeydown = (e: KeyboardEvent) => {
				if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
					e.preventDefault();
					e.stopPropagation();
					this.open(e.key === 'ArrowUp' ? -1 : 0);
				}
			};
			this.list.onkeydown = (e: KeyboardEvent) => {
				if ((e.target as HTMLElement).tagName === 'INPUT') return;
				e.stopPropagation();
				// Arrows walk the header and the rows; Home, End and type-ahead stay on the rows.
				const buttons = [...this.list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],
					rows = [...this.items.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],
					i = buttons.indexOf(this.shadowRoot!.activeElement as HTMLButtonElement);
				let next: number | undefined;
				if (e.key === 'ArrowDown') next = (i + 1) % buttons.length;
				else if (e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
				else if (e.key === 'Home') next = buttons.indexOf(rows[0]);
				else if (e.key === 'End') next = buttons.indexOf(rows[rows.length - 1]);
				else if (e.key === 'Escape') {
					e.preventDefault();
					this.close();
					return;
				} else if (e.key.length === 1) {
					const starts = (b: HTMLButtonElement) =>
						b.textContent.toLowerCase().startsWith(e.key.toLowerCase());
					const row = rows.find((b) => buttons.indexOf(b) > i && starts(b)) || rows.find(starts);
					next = row ? buttons.indexOf(row) : -1;
				}
				if (next !== undefined && next >= 0) {
					e.preventDefault();
					buttons[next]?.focus();
				}
			};
			this.observer = new MutationObserver(() => this.render());
			this.observer.observe(this, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ['aria-label', 'title', 'disabled', 'data-display-label']
			});
			this.render();
		}
		disconnectedCallback() {
			this.observer?.disconnect();
		}
		get options(): HTMLOptionElement[] {
			return [...this.querySelectorAll<HTMLOptionElement>(':scope > option')];
		}
		get value(): string {
			return (
				this._value ??
				this.options.find((o) => o.hasAttribute('selected'))?.value ??
				this.options[0]?.value ??
				''
			);
		}
		set value(v: string) {
			this._value = v;
			this.render();
		}
		get disabled(): boolean {
			return this._disabled;
		}
		set disabled(v: boolean) {
			this._disabled = v;
			this.render();
		}
		add(option: HTMLOptionElement) {
			this.append(option);
		}
		render() {
			if (!this.trigger) return;
			// A rename in progress owns the row; a re-render would drop its input. It is
			// skipped here and re-run when the edit ends: finish() always calls render().
			if (this._editing) return;
			const options = this.options;
			let selected = options.find((o) => o.value === this.value);
			if (!selected && this._value !== '') {
				this._value = null;
				selected = options.find((o) => o.hasAttribute('selected')) || options[0];
			}
			this.trigger.querySelector('span')!.textContent =
				this.getAttribute('data-display-label') || selected?.textContent || '';
			this.trigger.disabled = this.disabled || this.hasAttribute('disabled');
			this.trigger.setAttribute(
				'aria-label',
				this.getAttribute('aria-label') || this.getAttribute('title') || selected?.textContent || ''
			);
			this.list.setAttribute('aria-label', this.trigger.getAttribute('aria-label')!);
			const actionMenu = options.some((o) => o.dataset.actions);
			this.list.role = actionMenu ? 'menu' : 'listbox';
			this.trigger.setAttribute('aria-haspopup', actionMenu ? 'menu' : 'listbox');
			// The rebuilt list drops focus; the item that had it is refocused, by the row's
			// stable key where the options carry one (a re-sort moves values), else by value.
			const focused = this.shadowRoot!.activeElement as HTMLElement | null;
			const focusedValue = focused?.dataset.value;
			const focusedKey = focused?.dataset.key;
			const focusedWave = focused?.classList.contains('wave');
			this.items.replaceChildren(
				...options.map((o) => {
					const b = document.createElement('button');
					b.className = 'item' + (o.hasAttribute('data-divider') ? ' divider' : '');
					b.type = 'button';
					b.role = actionMenu ? 'menuitemradio' : 'option';
					b.disabled = o.disabled;
					b.textContent = o.textContent;
					if (o.dataset.detail) {
						const small = document.createElement('small');
						small.className = 'detail';
						small.textContent = o.dataset.detail;
						b.append(small);
					}
					b.dataset.value = o.value;
					if (o.dataset.key) b.dataset.key = o.dataset.key;
					b.setAttribute(actionMenu ? 'aria-checked' : 'aria-selected', String(o === selected));
					b.onclick = () => {
						this.value = o.value;
						this.close();
						this.dispatchEvent(new Event('change', { bubbles: true }));
					};
					if (!o.dataset.actions) return b;
					const row = document.createElement('div');
					row.className = 'choice-row';
					row.role = 'group';
					row.setAttribute('aria-label', o.textContent);
					row.append(b);
					// The selected row's name is renamed in place: clicking it (or Enter on it)
					// swaps the label for an input rather than re-selecting the take.
					const canRename =
						o.dataset.actions.split(',').includes('rename') &&
						!o.dataset.disabledActions?.split(',').includes('rename');
					if (canRename && o === selected) {
						b.title = t('action.rename');
						b.onclick = () => this.editName(o, b);
					}
					const wanted = o.dataset.actions.split(',');
					// The waveform is the play control: a full-width button whose bars fill with the
					// accent colour as the take plays, with a play/stop glyph at its left.
					if (o.dataset.peaks && wanted.includes('play')) {
						const wave = document.createElement('button');
						wave.type = 'button';
						wave.className = 'wave';
						wave.role = 'menuitem';
						wave.dataset.value = o.value;
						wave.dataset.rowKey = o.dataset.key || o.value;
						wave.dataset.peaks = o.dataset.peaks;
						wave.dataset.playLabel = t('action.label', {
							name: o.textContent,
							action: t('action.play')
						});
						wave.dataset.stopLabel = t('action.label', {
							name: o.textContent,
							action: t('action.stop')
						});
						wave.disabled = Boolean(
							o.disabled || o.dataset.disabledActions?.split(',').includes('play')
						);
						wave.setAttribute('aria-label', wave.dataset.playLabel);
						wave.title = t('action.play');
						wave.innerHTML =
							'<svg class="glyph" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l9 6-9 6z"/></svg><canvas></canvas>';
						wave.onclick = () =>
							this.dispatchEvent(
								new CustomEvent('optionaction', {
									bubbles: true,
									detail: { value: o.value, action: 'play' }
								})
							);
						row.append(wave);
						const peaks = JSON.parse(o.dataset.peaks);
						wavePeaksOf.set(wave, peaks);
						queueMicrotask(() => drawWave(wave.querySelector('canvas')!, peaks));
						const playing = this._rowPlaying?.[wave.dataset.rowKey];
						if (playing) applyRowPlaying(wave, playing.playing, playing.progress);
					}
					const actions: Record<string, { label: string; path: string }> = {
						download: { label: t('action.download'), path: 'M10 3v10m-4-4 4 4 4-4M4 13v4h12v-4' },
						delete: {
							label: t('action.delete'),
							path: 'M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8v6m4-6v6'
						}
					};
					const bar = document.createElement('div');
					bar.className = 'row-actions';
					for (const action of wanted) {
						const spec = actions[action];
						if (!spec) continue;
						const button = document.createElement('button');
						button.className = 'row-action';
						button.type = 'button';
						button.role = 'menuitem';
						button.dataset.value = o.value;
						button.dataset.action = action;
						button.disabled = Boolean(
							o.disabled || o.dataset.disabledActions?.split(',').includes(action)
						);
						button.setAttribute(
							'aria-label',
							t('action.label', { name: o.textContent, action: spec.label })
						);
						button.title = spec.label;
						button.innerHTML =
							'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="' + spec.path + '"/></svg>';
						button.onclick = () => {
							this.close();
							this.dispatchEvent(
								new CustomEvent('optionaction', {
									bubbles: true,
									detail: { value: o.value, action }
								})
							);
						};
						bar.append(button);
					}
					row.append(bar);
					return row;
				})
			);
			// Only while the list is open: a render that closes it must not pull focus back to a
			// hidden item (an edit keeps the list open, so its focus is restored).
			if (focusedValue && this.list.matches(':popover-open'))
				this.list
					.querySelector<HTMLButtonElement>(
						focusedWave
							? `.wave[data-value="${CSS.escape(focusedValue)}"]`
							: focusedKey
								? `.item[data-key="${CSS.escape(focusedKey)}"]`
								: `.item[data-value="${CSS.escape(focusedValue)}"]`
					)
					?.focus();
		}

		// Paints a take's wave button as playing (or not) at a progress, and remembers it so a
		// re-render restores it. The app drives this as the take plays.
		setRowPlaying(key: string, playing: boolean, progress = 0) {
			this._rowPlaying ??= {};
			if (playing) this._rowPlaying[key] = { playing, progress };
			else delete this._rowPlaying[key];
			// A closed menu holds no wave button; open() re-renders and restores the state.
			if (!this.list.matches(':popover-open')) return;
			const wave = this.shadowRoot!.querySelector<HTMLElement>(
				`.wave[data-row-key="${CSS.escape(key)}"]`
			);
			if (wave) applyRowPlaying(wave, playing, progress);
		}

		// Replaces the selected row's name with an input; Enter or blur commits, Escape
		// cancels. A commit emits `optionrename` with the take's stable key; the app persists
		// it and re-renders. Only one row edits at a time.
		editName(o: HTMLOptionElement, item: HTMLButtonElement) {
			if (this._editing) return;
			const row = item.closest<HTMLElement>('.choice-row');
			if (!row) return;
			this._editing = true;
			const input = document.createElement('input');
			input.className = 'rename';
			input.type = 'text';
			input.maxLength = 60;
			input.value = o.textContent!;
			input.setAttribute('aria-label', t('action.rename'));
			let done = false;
			const finish = (commit: boolean) => {
				if (done) return;
				done = true;
				this._editing = false;
				const name = input.value.trim();
				if (commit && name && name !== o.textContent) {
					o.textContent = name;
					this.dispatchEvent(
						new CustomEvent('optionrename', {
							bubbles: true,
							detail: { value: o.value, key: o.dataset.key || '', name }
						})
					);
				}
				this.render();
				// The input replaced (and detached) the name button, so focus it afresh from the
				// rebuilt row (by key: a rename can re-sort the rows); without this a keyboard
				// user is dropped on the body.
				this.list
					.querySelector<HTMLButtonElement>(
						o.dataset.key
							? `.item[data-key="${CSS.escape(o.dataset.key)}"]`
							: `.item[data-value="${CSS.escape(o.value)}"]`
					)
					?.focus();
			};
			input.onkeydown = (e) => {
				e.stopPropagation();
				if (e.key === 'Enter') {
					e.preventDefault();
					finish(true);
				} else if (e.key === 'Escape') {
					e.preventDefault();
					finish(false);
				}
			};
			// Any focus-out commits the name (moving to another control is not a reason to
			// discard the edit); only Escape cancels.
			input.addEventListener('focusout', () => finish(true));
			row.replaceChild(input, item);
			input.focus();
			input.select();
		}

		open(direction = 0) {
			if (this.disabled) return;
			this.render();
			const rect = this.getBoundingClientRect();
			this.list.showPopover();
			const box = this.list.getBoundingClientRect();
			this.list.style.left = Math.max(6, Math.min(rect.left, innerWidth - box.width - 6)) + 'px';
			this.list.style.top =
				(rect.bottom + box.height + 6 < innerHeight
					? rect.bottom + 5
					: Math.max(6, rect.top - box.height - 5)) + 'px';
			const rows = [...this.items.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
			const selected = rows.findIndex((b) => b.dataset.value === this.value);
			rows[direction < 0 ? rows.length - 1 : Math.max(0, selected)]?.focus();
		}
		close() {
			this.list.hidePopover();
			this.trigger.focus();
		}
	}
	customElements.define('koe-select', KoeSelect);
}
declare global {
	interface HTMLElementTagNameMap {
		'koe-select': KoeSelectElement;
	}
}
