#!/usr/bin/env node
/**
 * Ensure overlap staging sitemaps exist before Astro copies public/ → dist/.
 * Runs during build even when export-client-data is skipped.
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  buildOverlapUrls,
  loadFundsFromPortfolioJson,
  stagingFilesMissingOrEmpty,
  writeOverlapStagingFiles,
} from './lib/portfolio-overlap-sitemap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

function main() {
  if (!stagingFilesMissingOrEmpty(PUBLIC)) {
    console.log('  ✓ portfolio overlap staging sitemaps already present');
    return;
  }

  const funds = loadFundsFromPortfolioJson(ROOT);
  if (!funds) {
    const msg = '  ⚠ portfolio-overlap.json missing — cannot build overlap staging sitemaps';
    if (process.env.CI === 'true' || process.env.VERCEL === '1') {
      console.error(msg);
      console.error('     Run export-client-data or commit public/sitemap-portfolio-overlap-*.xml');
      process.exit(1);
    }
    console.warn(msg);
    return;
  }

  console.log(`  ↻ Generating overlap staging sitemaps from ${funds.length} funds...`);
  const urls = buildOverlapUrls(funds);
  writeOverlapStagingFiles(urls, PUBLIC);
}

main();
