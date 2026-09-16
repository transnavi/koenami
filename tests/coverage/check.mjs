// Merges every coverage-final.json under coverage/ and requires 100 % statements,
// branches, functions and lines over the tree under test, minus the documented
// exclusions. Usage: node tests/coverage/check.mjs [old|new] [--only=math,space,...]
// --only limits the gate to the named modules (basename without extension); the full
// suite runs without it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import libCoverage from 'istanbul-lib-coverage';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const tree = args.find((a) => !a.startsWith('--')) || process.env.KOENAMI_TREE || 'old';
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const prefix = tree === 'new' ? 'src/lib/' : 'tests/old-tree/web/';
const wanted = (rel) => rel.startsWith(prefix) && (!only || only.includes(rel.split('/').pop().replace(/\.[^.]+$/, '')));
const exclusions = JSON.parse(readFileSync(join(root, 'tests/coverage/exclusions.json'), 'utf8'))[tree];

const reportRoot = join(root, 'coverage');
if (!existsSync(reportRoot)) { console.error('no coverage/ directory; run the suite with coverage first (bun run test:unit:coverage)'); process.exit(1); }
function* reports(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* reports(path);
		else if (name === 'coverage-final.json') yield path;
	}
}
const map = libCoverage.createCoverageMap({});
for (const path of reports(reportRoot)) map.merge(JSON.parse(readFileSync(path, 'utf8')));

// An exclusion names a file, a kind and the source text at the location, so it follows
// the code through reformatting and still fails once that code is gone or reachable.
const sources = new Map();
const textAt = (rel, loc) => {
	if (!sources.has(rel)) sources.set(rel, readFileSync(join(root, rel), 'utf8').split('\n'));
	const lines = sources.get(rel);
	const line = lines[loc.start.line - 1] || '';
	const end = loc.end && loc.end.line === loc.start.line && typeof loc.end.column === 'number' ? loc.end.column : undefined;
	return line.slice(loc.start.column, end);
};
const used = new Set();
const misses = [];
const summary = libCoverage.createCoverageSummary();
for (const file of map.files()) {
	const rel = relative(root, file);
	if (!wanted(rel)) continue;
	const fc = map.fileCoverageFor(file);
	summary.merge(fc.toSummary());
	const excluded = (kind, loc) => {
		const text = textAt(rel, loc);
		const i = exclusions.findIndex((e) => e.file === rel && e.kind === kind && text.startsWith(e.code));
		if (i >= 0) used.add(i);
		return i >= 0;
	};
	const where = (loc) => `${rel}:${loc.start.line}:${loc.start.column} ${JSON.stringify(textAt(rel, loc).slice(0, 60))}`;
	for (const [id, hits] of Object.entries(fc.s)) if (!hits && !excluded('statement', fc.statementMap[id])) misses.push(`${where(fc.statementMap[id])} statement`);
	// A function is named by the text from its declaration onwards (istanbul's decl covers only the name).
	for (const [id, hits] of Object.entries(fc.f)) { const at = { start: fc.fnMap[id].decl.start }; if (!hits && !excluded('function', at)) misses.push(`${where(at)} function ${fc.fnMap[id].name}`); }
	for (const [id, hits] of Object.entries(fc.b)) if (hits.some((h) => !h) && !excluded('branch', fc.branchMap[id].loc)) misses.push(`${where(fc.branchMap[id].loc)} branch ${fc.branchMap[id].type} ${JSON.stringify(hits)}`);
}
const stale = exclusions.filter((_, i) => !used.has(i));
if (stale.length) misses.push(...stale.map((e) => `stale exclusion ${e.file} ${e.kind} ${JSON.stringify(e.code)}`));
const files = map.files().filter((f) => wanted(relative(root, f)));
if (!files.length) misses.push(`no coverage data for ${prefix}`);
console.log(`${files.length} files under ${prefix}: ${summary.statements.pct}% statements, ${summary.branches.pct}% branches, ${summary.functions.pct}% functions, ${summary.lines.pct}% lines before exclusions`);
if (misses.length) {
	console.error(misses.join('\n'));
	console.error(`\n${misses.length} uncovered location(s)`);
	process.exit(1);
}
console.log('coverage: 100 % of statements, branches, functions and lines');
