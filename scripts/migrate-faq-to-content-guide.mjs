/**
 * One-shot codemod: replace legacy card/card-compact FAQ sections with content-guide components.
 * Usage: node scripts/migrate-faq-to-content-guide.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function depthImportBlock(relPath) {
  const depth = relPath.replace(/^src\/pages\//, '').split('/').length;
  const prefix = '../'.repeat(depth);
  return `import ContentGuideSection from '${prefix}components/content-guide/ContentGuideSection.astro';
import ContentGuideFaqList from '${prefix}components/content-guide/ContentGuideFaqList.astro';
import ContentGuideFaqItem from '${prefix}components/content-guide/ContentGuideFaqItem.astro';`;
}

function collectAstroFiles(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(abs, ent.name);
    if (ent.isDirectory()) out.push(...collectAstroFiles(path.relative(root, p)));
    else if (ent.name.endsWith('.astro')) out.push(path.relative(root, p).replace(/\\/g, '/'));
  }
  return out;
}

const GLOB_DIRS = ['src/pages/tools', 'src/pages/broker', 'src/pages/mutual-funds', 'src/pages/ipo'];
const EXTRA = [
  'src/pages/index.astro',
  'src/pages/mutual-funds/index.astro',
  'src/pages/ipo/sme.astro',
  'src/pages/ipo/mainboard.astro',
  'src/pages/ipo/upcoming.astro',
  'src/pages/ipo/subscription-status.astro',
  'src/pages/ipo/allotment-status.astro',
];

const files = [...new Set([...GLOB_DIRS.flatMap(collectAstroFiles), ...EXTRA])].filter((f) => {
  if (f.includes('/blogs/') || f.includes('/learn/')) return false;
  const content = fs.readFileSync(path.join(root, f), 'utf8');
  return (
    !content.includes('ContentGuideFaqList') &&
    (content.includes('<details class="card') || content.includes('<details class="card-compact'))
  );
});

const FAQ_SECTION_RE =
  /(<!--[^>]*-->\s*)?<section class="container-(wide|narrow) py-(?:6|8|12)">\s*<h2 class="[^"]*">([^<]+)<\/h2>\s*<div class="space-y-[34](?: max-w-3xl)?">\s*((?:<details[\s\S]*?<\/details>\s*)+)<\/div>(\s*<a[\s\S]*?<\/a>)?\s*<\/section>/g;

const DETAILS_RE =
  /<details class="card(?:-compact)? group"(?:\s+open)?>\s*<summary class="cursor-pointer font-medium[^"]*">([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/g;

function normalizeAnswer(html) {
  const trimmed = html.trim();
  const pMatch = trimmed.match(/^<p class="[^"]*">([\s\S]*)<\/p>$/);
  if (pMatch) {
    return `<p>${pMatch[1].trim()}</p>`;
  }
  return trimmed;
}

function convertDetailsBlock(block) {
  const items = [];
  let m;
  DETAILS_RE.lastIndex = 0;
  while ((m = DETAILS_RE.exec(block)) !== null) {
    const open = /^<details[^>]*\sopen/.test(m[0]);
    const question = m[1].trim();
    const answer = normalizeAnswer(m[2]);
    const openAttr = open ? ' open' : '';
    items.push(`      <ContentGuideFaqItem${openAttr}>
        <span slot="question">${question}</span>
        ${answer}
      </ContentGuideFaqItem>`);
  }
  return items;
}

function convertFile(relPath) {
  const abs = path.join(root, relPath);
  let src = fs.readFileSync(abs, 'utf8');
  if (src.includes('ContentGuideFaqList')) return { relPath, changed: false, reason: 'already migrated' };

  let changed = false;
  src = src.replace(FAQ_SECTION_RE, (full, comment, container, title, detailsBlock, trailingLink) => {
    const items = convertDetailsBlock(detailsBlock);
    if (!items.length) return full;
    changed = true;
    const commentPrefix = comment ?? '';
    const linkBlock = trailingLink ? `\n    ${trailingLink.trim()}` : '';
    return `${commentPrefix}<ContentGuideSection title="${title.trim()}" variant="faq" bordered container="${container}">
    <ContentGuideFaqList>
${items.join('\n')}
    </ContentGuideFaqList>${linkBlock}
  </ContentGuideSection>`;
  });

  if (!changed) return { relPath, changed: false, reason: 'no match' };

  if (!src.includes('content-guide/ContentGuideSection')) {
    const importEnd = src.indexOf('---', 3);
    if (importEnd === -1) return { relPath, changed: false, reason: 'no frontmatter' };
    src = `${src.slice(0, importEnd)}${depthImportBlock(relPath)}\n${src.slice(importEnd)}`;
  }

  if (!dryRun) fs.writeFileSync(abs, src, 'utf8');
  return { relPath, changed: true };
}

const results = files.map(convertFile);
const migrated = results.filter((r) => r.changed);
const skipped = results.filter((r) => !r.changed);

console.log(`Files scanned: ${files.length}`);
console.log(`Migrated: ${migrated.length}`);
migrated.forEach((r) => console.log(`  ✓ ${r.relPath}`));
if (skipped.length) {
  console.log(`Skipped: ${skipped.length}`);
  skipped.forEach((r) => console.log(`  - ${r.relPath}: ${r.reason}`));
}
if (dryRun) console.log('\n(dry run — no files written)');
