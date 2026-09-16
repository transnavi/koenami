// Checks the kb vault: required frontmatter on every note, wikilinks that resolve
// to a note, and concept slugs that sources reference but no note defines yet.
import fs from 'node:fs';
import path from 'node:path';

const root = 'kb';
const dirs = ['sources', 'concepts', 'tools', 'communities'];
const notes = new Map();
for (const dir of dirs) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const file of fs.readdirSync(full)) if (file.endsWith('.md')) notes.set(file.slice(0, -3), { dir, text: fs.readFileSync(path.join(full, file), 'utf8') });
}
const required = { sources: ['type', 'key', 'title', 'year', 'evidence', 'verified'], concepts: ['type', 'title'], tools: ['type', 'title', 'url', 'verified'], communities: ['type', 'title', 'url', 'verified'] };
const aliases = new Map();
for (const [name, { text }] of notes) { const m = text.match(/^aliases: \[(.*)\]$/m); if (m) for (const a of m[1].split(',')) aliases.set(a.trim().replace(/^"|"$/g, ''), name); }
const problems = [], wanted = new Map();
for (const [name, { dir, text }] of notes) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { problems.push(`${dir}/${name}: no frontmatter`); continue; }
  for (const field of required[dir]) if (!new RegExp(`^${field}:`, 'm').test(fm[1])) problems.push(`${dir}/${name}: missing ${field}`);
  if (dir === 'sources' && !new RegExp(`^key: ${name}$`, 'm').test(fm[1])) problems.push(`sources/${name}: key does not match file name`);
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const target = m[1].trim();
    if (notes.has(target) || aliases.has(target)) continue;
    if (/^[a-z0-9-]+$/.test(target)) { wanted.set(target, (wanted.get(target) || 0) + 1); continue; }
    problems.push(`${dir}/${name}: unresolved link [[${target}]]`);
  }
}
console.log(`${notes.size} notes: ${dirs.map((d) => `${d} ${[...notes.values()].filter((n) => n.dir === d).length}`).join(', ')}`);
if (wanted.size) console.log('concepts referenced but not written:\n' + [...wanted].sort((a, b) => b[1] - a[1]).map(([k, n]) => `  ${k} (${n})`).join('\n'));
if (problems.length) { console.log('problems:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
