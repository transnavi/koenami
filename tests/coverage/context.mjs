import { execFileSync } from 'node:child_process';
// Prints each uncovered location with surrounding source, for working through the gaps.
//   node tests/coverage/context.mjs web/map.js [radius]
import { readFileSync } from 'node:fs';
const [file, radius = '70'] = process.argv.slice(2);
const lines = readFileSync(file, 'utf8').split('\n');
let out = '';
try {
	out = execFileSync('node', ['tests/coverage/check.mjs'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
} catch (e) {
	out = String(e.stdout) + String(e.stderr);
}
const r = Number(radius);
for (const line of out.split('\n')) {
	const m = new RegExp(
		`^${file.replace(/[.]/g, '\\.')}:(\\d+):(\\d+) "(.*?)" (statement|branch|function)(.*)$`
	).exec(line);
	if (!m) continue;
	const [, l, c, , kind, rest] = m;
	const src = lines[Number(l) - 1] || '';
	const col = Number(c);
	console.log(
		`${l}:${c} ${kind}${rest.trim() ? ' ' + rest.trim() : ''}\n    …${src.slice(Math.max(0, col - r), col)}⟦${src.slice(col, col + r)}⟧…`
	);
}
