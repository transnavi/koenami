/* One dialog for every ⓘ: the definition, the numbers, what moves the value, and what it cannot
   tell. The dialog is still markup in the studio's template body; it becomes a component with
   the other dialogs. */
import type { HelpEntry } from './profile';

const $ = (id: string) => document.getElementById(id)!;

export function openHelp(entry: HelpEntry, rows: [string, string | number][] = []) {
	$('metric-title').textContent = entry.label;
	$('metric-description').textContent = entry.description;
	$('metric-details').innerHTML = rows
		.map(([a, b]) => `<div class="metric-detail-row"><span>${a}</span><strong>${b}</strong></div>`)
		.join('');
	$('metric-factors').innerHTML = entry.factors.map((x) => `<li>${x}</li>`).join('');
	$('metric-caveats').innerHTML = entry.caveats.map((x) => `<li>${x}</li>`).join('');
	($('metric-dialog') as HTMLDialogElement).showModal();
}
