/** Move content-guide imports before first const in frontmatter. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const IMPORT_RE =
  /import ContentGuideSection from '[^']+';\nimport ContentGuideFaqList from '[^']+';\nimport ContentGuideFaqItem from '[^']+';\n?/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith('.astro')) out.push(p);
  }
  return out;
}

let fixed = 0;

for (const abs of walk(path.join(root, 'src/pages'))) {
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');
  if (!src.includes('content-guide/ContentGuideSection')) continue;

  const fmMatch = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) continue;

  const blockMatch = fmMatch[1].match(IMPORT_RE);
  if (!blockMatch) continue;

  const block = blockMatch[0].trimEnd() + '\n';
  let fm = fmMatch[1].replace(IMPORT_RE, '');
  const constIdx = fm.search(/\nconst /);
  if (constIdx === -1) continue;

  const newFm = `${fm.slice(0, constIdx)}\n${block}${fm.slice(constIdx + 1)}`;
  const next = src.replace(/^---\n[\s\S]*?\n---/, `---\n${newFm}---`);
  if (next !== src) {
    fs.writeFileSync(abs, next, 'utf8');
    fixed++;
    console.log(`  ✓ ${rel}`);
  }
}

console.log(`Fixed import order on ${fixed} file(s)`);
