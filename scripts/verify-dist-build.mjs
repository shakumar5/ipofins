#!/usr/bin/env node
/**
 * Fail fast when Astro did not prerender enough static HTML before sitemap work.
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  countBuiltHtmlPages,
  minBuiltHtmlPages,
  projectArtifactRoots,
  resolveArtifactRoot,
} from './lib/sitemap-utils.mjs';
import { existsSync } from 'fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const minPages = minBuiltHtmlPages();

function main() {
  const roots = projectArtifactRoots(ROOT);
  const counts = roots.map((root) => ({
    label: root.replace(ROOT, '').replace(/\\/g, '/') || '/',
    count: countBuiltHtmlPages(root),
  }));
  const artifactRoot = resolveArtifactRoot(ROOT);
  const best = counts.reduce((a, b) => (b.count > a.count ? b : a), { count: 0 });

  if (!existsSync(artifactRoot) || best.count < minPages) {
    console.error('  ❌ Astro build output is incomplete — too few prerendered HTML pages');
    for (const row of counts) {
      console.error(`       ${row.label}: ${row.count} index.html`);
    }
    console.error(`       required: >= ${minPages}`);
    console.error('  Check the Astro build log for prerender/Neon errors above this step.');
    process.exit(1);
  }

  console.log(`  ✓ dist build artifacts OK (${best.count} prerendered pages, min ${minPages})`);
}

main();
