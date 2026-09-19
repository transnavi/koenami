import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Raw browser coverage is written per test, named by the test title, so a full run starts
// from an empty directory and describes this run alone; E2E_KEEP_COVERAGE=1 keeps the
// other tests' files while a subset is rerun.
export default function setup() {
	if (process.env.E2E_KEEP_COVERAGE === '1') return;
	rmSync(fileURLToPath(new URL('../coverage/e2e/raw', import.meta.url)), {
		recursive: true,
		force: true
	});
}
