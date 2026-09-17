// Extracts the pinned vanilla web tree that the characterization goldens were
// recorded against, so the suite can run against it from any later commit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { commit } = JSON.parse(readFileSync(`${root}tests/golden/META.json`, 'utf8'));
const out = `${root}tests/old-tree`;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execFileSync('sh', ['-c', `git -C "${root}" archive ${commit} web | tar -x -C "${out}"`], {
	stdio: 'inherit'
});
writeFileSync(`${out}/COMMIT`, commit + '\n');
console.log(`old tree ${commit} → tests/old-tree/web`);
