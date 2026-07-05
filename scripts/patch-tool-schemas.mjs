#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'src/pages/tools');

function extractMeta(src) {
  const name = src.match(/["']name["']\s*:\s*["']([^"']+)["']/)?.[1]
    ?? src.match(/name:\s*['"]([^'"]+)['"]/)?.[1];
  const description = src.match(/["']description["']\s*:\s*\n?\s*["']([^"']+)["']/)?.[1]
    ?? src.match(/["']description["']\s*:\s*["']([^"']+)["']/)?.[1]
    ?? src.match(/description:\s*\n?\s*['"]([^'"]+)['"]/)?.[1];
  return { name, description };
}

for (const file of readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.astro') && f !== 'index.astro')) {
  const path = join(TOOLS_DIR, file);
  let src = readFileSync(path, 'utf-8');
  if (src.includes('toolPageJsonLd')) {
    console.log(`Skip ${file} (already migrated)`);
    continue;
  }

  const slug = file.replace('.astro', '');
  const { name, description } = extractMeta(src);
  if (!name || !description) {
    console.warn(`Skip ${file} — name=${name} desc=${!!description}`);
    continue;
  }

  // Strip const jsonLd = ... ; (object or array, multiline)
  src = src.replace(/const jsonLd = [\s\S]*?;\r?\n\r?\n/, '');

  if (!src.includes("tool-schemas")) {
    src = src.replace(/^---\r?\n/, `---\nimport { toolPageJsonLd } from '../../lib/tool-schemas';\n`);
  }

  const block = `const jsonLd = toolPageJsonLd({
  name: ${JSON.stringify(name)},
  slug: ${JSON.stringify(slug)},
  description: ${JSON.stringify(description)},
});

`;

  // Insert after last import before const faqJsonLd or <BaseLayout
  src = src.replace(/((?:^import .+\r?\n)+)\r?\n(?=const faqJsonLd|<BaseLayout)/m, `$1\n${block}`);

  writeFileSync(path, src);
  console.log(`Patched ${file}`);
}
