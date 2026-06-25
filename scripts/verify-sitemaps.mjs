#!/usr/bin/env node
/** Fail the build if sitemap-index references missing or empty portfolio overlap sitemaps. */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseUrlsetLocs } from './lib/sitemap-utils.mjs';
import { findPrebuiltOverlapSitemaps, parseUrlsetLocCount } from './lib/portfolio-overlap-sitemap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const INDEX = join(DIST, 'sitemap-index.xml');

function main() {
  if (!existsSync(INDEX)) {
    console.error('  ❌ sitemap-index.xml missing in dist/');
    process.exit(1);
  }

  const indexXml = readFileSync(INDEX, 'utf8');
  const childLocs = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());

  let errors = 0;
  for (const loc of childLocs) {
    const name = loc.replace(/^https:\/\/ipofins\.com\//, '');
    const path = join(DIST, name);
    if (!existsSync(path)) {
      console.error(`  ❌ sitemap-index references missing file: ${name}`);
      errors += 1;
      continue;
    }
    if (/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name) && parseUrlsetLocCount(path) === 0) {
      console.error(`  ❌ ${name} is empty (0 URLs)`);
      errors += 1;
    }
  }

  const overlapFiles = findPrebuiltOverlapSitemaps(DIST);
  const overlapUrls = overlapFiles.reduce((sum, name) => sum + parseUrlsetLocCount(join(DIST, name)), 0);

  if (overlapUrls < 1000) {
    console.error(`  ❌ portfolio overlap sitemaps have only ${overlapUrls} URLs (expected thousands)`);
    errors += 1;
  } else {
    console.log(`  ✓ portfolio overlap sitemaps: ${overlapFiles.length} file(s), ${overlapUrls} URLs`);
  }

  if (errors) {
    console.error(`  ❌ sitemap verification failed (${errors} issue(s))`);
    process.exit(1);
  }

  console.log(`  ✓ sitemap-index.xml OK (${childLocs.length} child sitemaps)`);
}

main();
