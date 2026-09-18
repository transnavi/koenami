// Coverage collection for the unit layer (vitest-monocart-coverage): the raw V8 data is
// kept so tests/coverage/report.mjs can merge it with the browser runs.
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
export default {
	name: 'koenami unit coverage',
	outputDir: `${root}coverage/unit`,
	reports: [['raw'], ['console-summary']],
	entryFilter: (entry) =>
		/\/(tests\/old-tree\/web|src\/lib)\/|\/src\/service-worker\.ts/.test(entry.url || ''),
	sourceFilter: (path) => !path.includes('node_modules'),
	sourcePath: (filePath) =>
		filePath
			.replace(/^.*?tests\/old-tree\//, '')
			.replace(/^.*?(src\/(lib\/|service-worker\.ts))/, '$1'),
	cleanCache: true
};
