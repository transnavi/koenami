/* <koe-select>: the studio's popover select, a custom element with the options as light-DOM
   <option> children and the trigger and list in its shadow root. */
import { t } from './i18n';
let menuId = 0;
/* The take rows' waveform preview: `peaks` are 0…1 bucket maxima, drawn as centred bars in the
   row's text colour. */
const drawWave = (canvas: HTMLCanvasElement, peaks: number[]) => {
	const w = 208,
		h = 18,
		dpr = canvas.ownerDocument?.defaultView?.devicePixelRatio || 1;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = w + 'px';
	canvas.style.height = h + 'px';
	const g = canvas.getContext('2d')!;
	g.scale(dpr, dpr);
	g.fillStyle = getComputedStyle(canvas).color;
	const n = peaks.length,
		step = w / n;
	for (let i = 0; i < n; i++) {
		const bar = Math.max(1, peaks[i] * h);
		g.fillRect(i * step, (h - bar) / 2, Math.max(1, step * 0.66), bar);
	}
};
/* The element's interface for callers; the class itself is created on registration, so the
   module also loads where HTMLElement does not exist (prerendering). */
export interface KoeSelectElement extends HTMLElement {
	value: string;
	disabled: boolean;
	readonly options: HTMLOptionElement[];
	add(option: HTMLOptionElement): void;
	open(direction?: number): void;
	close(): void;
}
/* Registers the element. A page that uses it calls this once it runs in the browser, before it
   wires the elements. Every route is its own document (see app.html), so the guard only
   matters when a page mounts twice in one document, as under HMR in vite dev. */
export function defineKoeSelect() {
	if (customElements.get('koe-select')) return;
	class KoeSelect extends HTMLElement {
		_value: string | null;
		_disabled: boolean;
		active: number;
		uid: string;
		trigger!: HTMLButtonElement;
		list!: HTMLDivElement;
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
			this.shadowRoot!.innerHTML = `<style>:host{position:relative;min-width:0;color:var(--ink);font:inherit}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.trigger{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;height:100%;min-height:28px;padding:5px 8px;background:var(--surface);border:1px solid var(--line);border-radius:6px;font-size:inherit;text-align:left}.trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.icon{width:16px;height:16px;flex-shrink:0;color:var(--muted);fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.trigger:after{content:'';width:5px;height:5px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(45deg);margin:0 3px 3px 0;flex-shrink:0}.trigger:disabled{opacity:.4;cursor:default}.list{position:fixed;inset:auto;margin:0;padding:4px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow);min-width:120px;max-height:min(320px,55vh);overflow:auto;scrollbar-width:thin;scrollbar-color:var(--muted) transparent;overscroll-behavior:contain;z-index:1000}.list::-webkit-scrollbar{width:7px}.list::-webkit-scrollbar-track{background:transparent}.list::-webkit-scrollbar-thumb{background:var(--muted);border:2px solid var(--surface);border-radius:8px}.list::-webkit-scrollbar-button{display:none}.list[role=menu]{width:min(340px,calc(100vw - 24px));max-height:min(420px,65vh);padding:6px}.choice-row+.choice-row{margin-top:2px}.item{display:block;border:0;background:transparent;padding:8px 10px;width:100%;text-align:left;white-space:nowrap;border-radius:5px;font-size:12px}.item:hover,.item:focus{background:var(--raised);outline:0}.item[aria-selected=true],.item[aria-checked=true]{background:var(--selected);color:var(--accent)}.item:disabled{opacity:.4}.item .detail{display:block;color:var(--muted);font-size:10px;margin-top:3px;font-variant-numeric:tabular-nums}.item.divider{border-top:1px solid var(--line);border-radius:0;margin-top:5px;padding-top:12px}.item .wave{display:block;height:18px;margin-top:6px;flex:none}.choice-row{display:flex;align-items:center;gap:2px;max-width:min(400px,calc(100vw - 24px))}.choice-row .item{flex:1;min-width:0;width:auto;overflow:hidden;text-overflow:ellipsis}.row-action{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;padding:6px;border:0;border-radius:5px;background:transparent;color:var(--muted)}.row-action:hover,.row-action:focus-visible{background:var(--raised);color:var(--accent)}.row-action[data-action=delete]:hover,.row-action[data-action=delete]:focus-visible{color:var(--danger)}.row-action:disabled{opacity:.3;cursor:default}.row-action svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}</style><button part="trigger" class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="${this.uid}"><span></span></button><div class="list" id="${this.uid}" role="listbox" popover="auto"></div>`;
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
				e.stopPropagation();
				const buttons = [...this.list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],
					i = buttons.indexOf(this.shadowRoot!.activeElement as HTMLButtonElement);
				let next: number | undefined;
				if (e.key === 'ArrowDown') next = (i + 1) % buttons.length;
				else if (e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
				else if (e.key === 'Home') next = 0;
				else if (e.key === 'End') next = buttons.length - 1;
				else if (e.key === 'Escape') {
					e.preventDefault();
					this.close();
					return;
				} else if (e.key.length === 1) {
					next = buttons.findIndex(
						(b, j) => j > i && b.textContent.toLowerCase().startsWith(e.key.toLowerCase())
					);
					if (next < 0)
						next = buttons.findIndex((b) =>
							b.textContent.toLowerCase().startsWith(e.key.toLowerCase())
						);
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
			this.list.replaceChildren(
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
					if (o.dataset.peaks) {
						const wave = document.createElement('canvas');
						wave.className = 'wave';
						const peaks = o.dataset.peaks;
						b.append(wave);
						queueMicrotask(() => drawWave(wave, JSON.parse(peaks)));
					}
					b.dataset.value = o.value;
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
					const actions: Record<string, { label: string; path: string }> = {
						play: { label: t('action.play'), path: 'M6 4l10 6-10 6z' },
						rename: { label: t('action.rename'), path: 'M13.5 3.5l3 3L7 16l-4 1 1-4z' },
						download: { label: t('action.download'), path: 'M10 3v10m-4-4 4 4 4-4M4 13v4h12v-4' },
						delete: {
							label: t('action.delete'),
							path: 'M3 5h14M8 5V3h4v2M5 5l1 12h8l1-12M8 8v6m4-6v6'
						}
					};
					for (const action of o.dataset.actions.split(',')) {
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
							if (action !== 'play') this.close();
							this.dispatchEvent(
								new CustomEvent('optionaction', {
									bubbles: true,
									detail: { value: o.value, action }
								})
							);
						};
						row.append(button);
					}
					return row;
				})
			);
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
			const buttons = [...this.list.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
			const selected = buttons.findIndex((b) => b.dataset.value === this.value);
			buttons[direction < 0 ? buttons.length - 1 : Math.max(0, selected)]?.focus();
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
