import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Raw browser coverage is written per test; a run starts from an empty directory so the
// report describes this run alone.
export default function setup() {
	rmSync(fileURLToPath(new URL('../coverage/e2e/raw', import.meta.url)), { recursive: true, force: true });
}
