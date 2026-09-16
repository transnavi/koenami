import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Extracts the pinned vanilla tree when it is missing or belongs to another commit.
export default function setup() {
	if ((process.env.KOENAMI_TREE || 'old') !== 'old') return;
	const root = fileURLToPath(new URL('../..', import.meta.url));
	const { commit } = JSON.parse(readFileSync(`${root}tests/golden/META.json`, 'utf8'));
	const stamp = `${root}tests/old-tree/COMMIT`;
	if (existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === commit) return;
	execFileSync('node', [`${root}tests/scripts/checkout-old.mjs`], { stdio: 'inherit' });
}
