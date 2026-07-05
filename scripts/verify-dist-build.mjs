#!/usr/bin/env node
/**
 * Fail fast when Astro did not prerender enough static HTML before sitemap work.
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import {
  countBuiltHtmlPages,
  distRoot,
  minBuiltHtmlPages,
  resolvePageArtifactRoot,
} from './lib/sitemap-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const minPages = minBuiltHtmlPages();

function main() {
  const dist = distRoot(ROOT);
  const pageRoot = resolvePageArtifactRoot(ROOT);
  const pageCount = countBuiltHtmlPages(pageRoot, { max: 50_000 });
  const nested = !existsSync(join(dist, 'index.html')) && existsSync(join(dist, 'client', 'index.html'));

  if (pageCount < minPages) {
    console.error('  ❌ Astro build output is incomplete — too few prerendered HTML pages');
    console.error(`       dist/index.html: ${existsSync(join(dist, 'index.html'))}`);
    console.error(`       dist/client/index.html: ${existsSync(join(dist, 'client', 'index.html'))}`);
    console.error(`       page artifact root: ${pageRoot.replace(ROOT, '')} (${pageCount} index.html)`);
    console.error(`       required: >= ${minPages}`);
    if (nested) {
      console.error('  Hint: run scripts/normalize-dist-layout.mjs (dist/client/ was not hoisted).');
    }
    console.error('  Check the Astro build log for prerender errors above this step.');
    process.exit(1);
  }

  if (pageRoot !== dist) {
    console.warn(`  ⚠ pages under ${pageRoot.replace(ROOT, '')} — expected dist/ after normalize-dist-layout`);
  }

  console.log(`  ✓ dist build artifacts OK (${pageCount} pages at ${pageRoot.replace(ROOT, '') || '/dist'})`);
}

main();
