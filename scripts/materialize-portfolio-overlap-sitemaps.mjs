#!/usr/bin/env node
/**
 * Write final public/sitemap-portfolio-overlap-*.xml from staging or portfolio-overlap.json.
 * Run locally after export, then commit the generated files for reliable CI deploys.
 */
import { existsSync, unlinkSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  SITEMAP_URL_LIMIT,
  chunkUrls,
  todayIso,
  writeUrlsetSync,
} from './lib/sitemap-utils.mjs';
import {
  buildOverlapUrls,
  collectStagingUrlsFromDir,
  loadFundsFromPortfolioJson,
} from './lib/portfolio-overlap-sitemap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const LASTMOD = todayIso();

function removeOldFinalFiles() {
  if (!existsSync(PUBLIC)) return;
  for (const name of readdirSync(PUBLIC)) {
    if (/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name)) {
      unlinkSync(join(PUBLIC, name));
    }
  }
}

function main() {
  let urls = collectStagingUrlsFromDir(PUBLIC);
  if (!urls.length) {
    const funds = loadFundsFromPortfolioJson(ROOT);
    if (!funds) {
      console.error('  ❌ No staging sitemaps or portfolio-overlap.json found');
      process.exit(1);
    }
    urls = buildOverlapUrls(funds);
  }

  removeOldFinalFiles();
  const chunks = chunkUrls(urls, SITEMAP_URL_LIMIT);

  if (chunks.length === 1) {
    writeUrlsetSync(writeFileSync, join(PUBLIC, 'sitemap-portfolio-overlap.xml'), chunks[0], {
      lastmod: LASTMOD,
      changefreq: 'monthly',
      priority: '0.6',
    });
    console.log(`  ✓ sitemap-portfolio-overlap.xml (${chunks[0].length} URLs)`);
    return;
  }

  chunks.forEach((chunk, idx) => {
    const name = `sitemap-portfolio-overlap-${idx}.xml`;
    writeUrlsetSync(writeFileSync, join(PUBLIC, name), chunk, {
      lastmod: LASTMOD,
      changefreq: 'monthly',
      priority: '0.6',
    });
    console.log(`  ✓ ${name} (${chunk.length} URLs)`);
  });
}

main();
