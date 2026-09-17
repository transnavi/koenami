// Regenerates the generated part of kb/index.md (everything after the marker) from the
// notes' frontmatter: tutorials, concepts by group, tools, communities, sources by grade.
// The hand-written map of content above the marker is left alone.
import fs from 'node:fs';
import path from 'node:path';

const root = 'kb';
const marker = '<!-- generated:start — everything below is written by scripts/kb-index.mjs -->';
const read = (dir) => fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const text = fs.readFileSync(path.join(root, dir, f), 'utf8');
  const fm = (text.match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
  const field = (k) => (fm.match(new RegExp(`^${k}: *(.*)$`, 'm')) || [, ''])[1].trim().replace(/^"|"$/g, '');
  return { key: f.slice(0, -3), title: field('title'), title_en: field('title_en'), year: field('year'), evidence: field('evidence'), authors: field('authors').replace(/^\[|\]$/g, '').split(',')[0].trim(), language: field('language'), kind: field('kind') };
}) : [];
const sources = read('sources'), concepts = read('concepts'), tools = read('tools'), communities = read('communities'), tutorials = read('tutorials');
const line = (s) => `- [[${s.key}]] — ${s.authors ? s.authors + ' ' : ''}${s.year}, ${s.title}${s.title_en ? ` (${s.title_en})` : ''}`;
const out = [marker, ''];
if (tutorials.length) { out.push('## Tutorials', ''); for (const t of tutorials) out.push(`- [[${t.key}]] — ${t.title}`); out.push(''); }
out.push('## All concepts', '', concepts.map((c) => `[[${c.key}]]`).join(' · '), '');
out.push('## Tools and communities', '', tools.map((c) => `[[${c.key}]]`).join(' · '), '', communities.map((c) => `[[${c.key}]]`).join(' · '), '');
out.push('## Sources by evidence grade', '');
for (const grade of ['high', 'medium', 'low', 'community']) {
  const list = sources.filter((s) => s.evidence === grade).sort((a, b) => a.year.localeCompare(b.year) || a.key.localeCompare(b.key));
  out.push(`### ${grade} (${list.length})`, '');
  for (const s of list) out.push(line(s));
  out.push('');
}
const byLang = {};
for (const s of sources) (byLang[s.language || '?'] ||= []).push(s.key);
out.push('## Sources by language', '');
for (const [lang, keys] of Object.entries(byLang).sort((a, b) => b[1].length - a[1].length)) out.push(`- **${lang}** (${keys.length}): ${keys.map((k) => `[[${k}]]`).join(' · ')}`);
out.push('');
const p = path.join(root, 'index.md');
const text = fs.readFileSync(p, 'utf8');
const head = text.includes(marker) ? text.slice(0, text.indexOf(marker)) : text;
fs.writeFileSync(p, head.trimEnd() + '\n\n' + out.join('\n'));
console.log(`index: ${tutorials.length} tutorials, ${concepts.length} concepts, ${tools.length} tools, ${communities.length} communities, ${sources.length} sources`);
