import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import checkoutOld from '../tests/unit/global-setup';

// The browser layer serves the same pinned tree as the unit layer (KOENAMI_TREE=old),
// extracted by the shared setup. Raw browser coverage is written per test, named by
// the test title, so a full run starts from an empty directory and describes this run
// alone; E2E_KEEP_COVERAGE=1 keeps the other tests' files while a subset is rerun.
export default function setup() {
	checkoutOld();
	if (process.env.E2E_KEEP_COVERAGE === '1') return;
	rmSync(fileURLToPath(new URL('../coverage/e2e/raw', import.meta.url)), {
		recursive: true,
		force: true
	});
}
