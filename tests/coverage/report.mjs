// Converts the raw V8 coverage of both layers into istanbul reports that
// tests/coverage/check.mjs merges:
//   coverage/unit/raw  (written by vitest-monocart-coverage) → coverage/unit/coverage-final.json
//   coverage/e2e/raw   (written per test by the Playwright fixture) → coverage/e2e/coverage-final.json
// The browser is served the pinned files unchanged (import.meta.env.PROD is substituted at
// the same width, see tests/mock-api/server.mjs) and the unit layer resolves
// its transforms through source maps, so both describe identical source text and the
// istanbul statement maps line up.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import MCR from 'monocart-coverage-reports';

const root = fileURLToPath(new URL('../..', import.meta.url));

// Served URLs and checked-out paths both become repository paths; query strings (the
// unit tests' cache-busting import) are not part of the file.
const sourcePath = (filePath) => {
	const clean = filePath
		.replace(/^127\.0\.0\.1[-:]\d+\//, '')
		.replace(/(\.[cm]?js|\.ts|\.svelte)[^/]*$/, '$1')
		.replace(/^.*?(src\/(lib\/|service-worker))/, '$1');
	return clean.replace(/^@fs\/.*?\/src\//, 'src/');
};
const entryFilter = (entry) => {
	const url = entry.url || '';
	if (url.startsWith('file://')) return /\/src\/(lib\/|service-worker)/.test(url);
	const u = new URL(url);
	return (
		u.hostname === '127.0.0.1' &&
		!u.pathname.startsWith('/@') &&
		!u.pathname.includes('/node_modules/') &&
		/\.(js|ts|svelte)$/.test(u.pathname)
	);
};
const options = (name, outputDir) => ({
	name,
	outputDir,
	entryFilter,
	sourcePath,
	reports: [['json', { file: 'coverage-final.json' }], ['console-summary']],
	sourceFilter: (path) => !path.includes('node_modules'),
	clean: false,
	cleanCache: true
});

let generated = 0;
const unitRaw = join(root, 'coverage/unit/raw');
if (existsSync(unitRaw)) {
	await MCR({
		...options('koenami unit coverage', join(root, 'coverage/unit')),
		inputDir: [unitRaw]
	}).generate();
	generated++;
}
const e2eRaw = join(root, 'coverage/e2e/raw');
if (existsSync(e2eRaw)) {
	const mcr = MCR(options('koenami browser coverage', join(root, 'coverage/e2e')));
	for (const name of readdirSync(e2eRaw))
		await mcr.add(JSON.parse(readFileSync(join(e2eRaw, name), 'utf8')).result);
	await mcr.generate();
	generated++;
}
if (!generated) {
	console.error('no raw coverage; run test:unit:coverage and/or test:e2e first');
	process.exit(1);
}
