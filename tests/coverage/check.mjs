// Merges every coverage-final.json under coverage/ and requires 100 % statements,
// branches, functions and lines over src/, minus the documented
// exclusions. Usage: node tests/coverage/check.mjs [--only=math,space,...]
// --only limits the gate to the named modules (basename without extension); the full
// suite runs without it.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import libCoverage from 'istanbul-lib-coverage';
import ts from 'typescript';

const root = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const only = args
	.find((a) => a.startsWith('--only='))
	?.slice(7)
	.split(',');
const prefix = 'src/';
const normalize = (rel) => rel;
const sourceRoot = root;
// The browser measurement engine is not wired into the studio yet; its unit tests drive the
// generated package, and the gate takes it up when the studio loads it.
const deferred = (rel) => rel.startsWith('src/lib/measure/');
const wanted = (rel) =>
	rel.startsWith(prefix) &&
	!deferred(rel) &&
	(!only ||
		only.includes(
			rel
				.split('/')
				.pop()
				.replace(/\.[^.]+$/, '')
		));
const exclusions = JSON.parse(
	readFileSync(join(root, 'tests/coverage/exclusions.json'), 'utf8')
).exclusions;

const reportRoot = join(root, 'coverage');
if (!existsSync(reportRoot)) {
	console.error(
		'no coverage/ directory; run the suite with coverage first (bun run test:unit:coverage)'
	);
	process.exit(1);
}
function* reports(dir) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* reports(path);
		else if (name === 'coverage-final.json') yield path;
	}
}
const map = libCoverage.createCoverageMap({});
for (const path of reports(reportRoot)) {
	console.log(`merging ${relative(root, path)} (${statSync(path).mtime.toISOString()})`);
	const report = JSON.parse(readFileSync(path, 'utf8'));
	for (const [file, data] of Object.entries(report)) {
		const rel = normalize(relative(root, file.startsWith('/') ? file : join(root, file)));
		const fc = libCoverage.createFileCoverage({ ...data, path: join(root, rel) });
		map.merge(libCoverage.createCoverageMap({ [join(root, rel)]: fc }));
	}
}

// An exclusion names a file, a kind, the line, the column and the source text at the
// location; the text guards against an edit that moves other code onto that position,
// and an entry that matches nothing fails the gate.
const sources = new Map();
const textAt = (rel, loc) => {
	if (!sources.has(rel)) sources.set(rel, readFileSync(join(sourceRoot, rel), 'utf8').split('\n'));
	const lines = sources.get(rel);
	const line = lines[loc.start.line - 1] || '';
	const end =
		loc.end && loc.end.line === loc.start.line && typeof loc.end.column === 'number'
			? loc.end.column
			: undefined;
	return line.slice(loc.start.column, end);
};
const used = new Set();
const misses = [];
const summary = libCoverage.createCoverageSummary();
for (const file of map.files()) {
	const rel = relative(root, file);
	if (!wanted(rel)) continue;
	const fc = map.fileCoverageFor(file);
	if (!existsSync(join(sourceRoot, rel))) {
		misses.push(`${rel}: covered file missing from the tree`);
		continue;
	}
	summary.merge(fc.toSummary());
	const excluded = (kind, loc) => {
		const text = textAt(rel, loc);
		const i = exclusions.findIndex(
			(e) =>
				e.file === rel &&
				e.kind === kind &&
				e.line === loc.start.line &&
				(e.column === undefined || e.column === loc.start.column) &&
				text.startsWith(e.code)
		);
		if (i >= 0) used.add(i);
		return i >= 0;
	};
	const where = (loc) =>
		`${rel}:${loc.start.line}:${loc.start.column} ${JSON.stringify(textAt(rel, loc).slice(0, 60))}`;
	for (const [id, hits] of Object.entries(fc.s))
		if (!hits && !excluded('statement', fc.statementMap[id]))
			misses.push(`${where(fc.statementMap[id])} statement`);
	// A function is named by the text from its declaration onwards (istanbul's decl covers only the name).
	for (const [id, hits] of Object.entries(fc.f)) {
		const at = { start: fc.fnMap[id].decl.start };
		if (!hits && !excluded('function', at))
			misses.push(`${where(at)} function ${fc.fnMap[id].name}`);
	}
	for (const [id, hits] of Object.entries(fc.b))
		if (hits.some((h) => !h) && !excluded('branch', fc.branchMap[id].loc))
			misses.push(
				`${where(fc.branchMap[id].loc)} branch ${fc.branchMap[id].type} ${JSON.stringify(hits)}`
			);
}
// With --only, entries for other modules are simply out of scope.
const stale = exclusions.filter((e, i) => !used.has(i) && wanted(e.file));
if (stale.length)
	misses.push(
		...stale.map(
			(e) => `stale exclusion ${e.file}:${e.line}:${e.column} ${e.kind} ${JSON.stringify(e.code)}`
		)
	);
// Every source file of the tree must appear in the data; a module no test loads would
// otherwise pass unnoticed.
const sourceFiles = [];
// A .ts module that erases to nothing (types only) has no runtime for either layer to see;
// a server module runs on the worker, which neither layer drives yet.
const typesOnly = (p) =>
	p.endsWith('.ts') &&
	!/\S/.test(
		ts
			.transpileModule(readFileSync(p, 'utf8'), {
				compilerOptions: { target: ts.ScriptTarget.ESNext, verbatimModuleSyntax: true }
			})
			.outputText.replace(/^export \{\};$/m, '')
	);
const walk = (dir, deep) => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (deep) walk(p, deep);
		} else if (
			/\.(js|ts|svelte)$/.test(name) &&
			!name.endsWith('.d.ts') &&
			// Server-only modules (hooks.server.ts, +server.ts endpoints) run in the prerenderer
			// and the Worker, which the browser coverage cannot see.
			!name.endsWith('.server.ts') &&
			name !== '+server.ts' &&
			!typesOnly(p)
		)
			sourceFiles.push(normalize(relative(root, p)));
	}
};
walk(join(root, 'src'), true);
const files = map.files().filter((f) => wanted(relative(root, f)));
for (const rel of sourceFiles.filter(wanted))
	if (!files.some((f) => relative(root, f) === rel))
		misses.push(`${rel}: no coverage data (no test loads it)`);
if (!files.length) misses.push(`no coverage data for ${prefix}`);
console.log(
	`${files.length} files under ${prefix}: ${summary.statements.pct}% statements, ${summary.branches.pct}% branches, ${summary.functions.pct}% functions, ${summary.lines.pct}% lines before exclusions`
);
if (misses.length) {
	console.error(misses.join('\n'));
	console.error(`\n${misses.length} uncovered location(s)`);
	process.exit(1);
}
console.log('coverage: 100 % of statements, branches, functions and lines');
