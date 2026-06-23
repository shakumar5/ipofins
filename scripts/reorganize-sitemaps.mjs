/**
 * Post-build: replace Astro's default sitemap output with categorized child sitemaps
 * and a clean sitemap-index.xml (10 canonical buckets + lastmod).
 */
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  CANONICAL_SITEMAP_INDEX,
  SITE,
  SITEMAP_URL_LIMIT,
  chunkUrls,
  classifySitemapBucket,
  parseUrlsetLocs,
  pathnameFromLoc,
  todayIso,
  writeSitemapIndexSync,
  writeUrlsetSync,
} from './lib/sitemap-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const LASTMOD = todayIso();

const ASTRO_SITEMAP_RE = /^sitemap-\d+\.xml$/;
const LEGACY_SITEMAPS = [
  'sitemap-smart-money-tracker.xml',
  'sitemap-portfolio-overlap-index.xml',
];

function collectAstroUrls() {
  const urls = [];
  if (!existsSync(DIST)) return urls;

  for (const name of readdirSync(DIST)) {
    if (!ASTRO_SITEMAP_RE.test(name)) continue;
    const xml = readFileSync(join(DIST, name), 'utf8');
    urls.push(...parseUrlsetLocs(xml));
  }
  return urls;
}

function collectOverlapStagingUrls() {
  const urls = [];
  if (!existsSync(DIST)) return urls;

  for (const name of readdirSync(DIST)) {
    if (!/^sitemap-overlap-staging(-\w+)?\.xml$/.test(name)) continue;
    const xml = readFileSync(join(DIST, name), 'utf8');
    urls.push(...parseUrlsetLocs(xml));
  }
  return urls;
}

function bucketUrls(allLocs) {
  const buckets = new Map(CANONICAL_SITEMAP_INDEX.map((name) => [name, []]));

  for (const loc of allLocs) {
    const path = pathnameFromLoc(loc);
    if (!path || path === '/404') continue;
    const bucket = classifySitemapBucket(path);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(loc.startsWith('http') ? loc : `${SITE}${path}`);
  }

  return buckets;
}

function writePortfolioOverlapSitemap(overlapUrls) {
  const chunks = chunkUrls(overlapUrls, SITEMAP_URL_LIMIT);

  if (chunks.length === 1) {
    const name = 'sitemap-portfolio-overlap.xml';
    const count = writeUrlsetSync(writeFileSync, join(DIST, name), chunks[0], {
      lastmod: LASTMOD,
      changefreq: 'monthly',
      priority: '0.6',
    });
    console.log(`  ✓ ${name} (${count} URLs)`);
    return [name];
  }

  // Google allows only one index level: sitemap-index → urlset (no nested sitemapindex).
  const childNames = [];
  chunks.forEach((chunk, idx) => {
    const name = `sitemap-portfolio-overlap-${idx}.xml`;
    writeUrlsetSync(writeFileSync, join(DIST, name), chunk, {
      lastmod: LASTMOD,
      changefreq: 'monthly',
      priority: '0.6',
    });
    childNames.push(name);
    console.log(`  ✓ ${name} (${chunk.length} URLs)`);
  });
  console.log(`  ✓ portfolio overlap → ${childNames.length} urlsets (listed in sitemap-index.xml)`);
  return childNames;
}

/** Replace overlap placeholder with one or more urlset filenames (never a nested index). */
function buildSitemapIndexEntries(overlapEntries) {
  const entries = [];
  for (const name of CANONICAL_SITEMAP_INDEX) {
    if (name === 'sitemap-portfolio-overlap.xml') {
      entries.push(...overlapEntries);
      continue;
    }
    entries.push(name);
  }
  return entries;
}

function removeStaleOverlapSitemaps(activeNames) {
  if (!existsSync(DIST)) return;
  const active = new Set(activeNames);
  for (const name of readdirSync(DIST)) {
    if (!/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name)) continue;
    if (!active.has(name)) unlinkSync(join(DIST, name));
  }
}

function writeBucketSitemaps(buckets) {
  const changefreqByBucket = {
    'sitemap-ipos.xml': 'weekly',
    'sitemap-mutual-funds.xml': 'weekly',
    'sitemap-amcs.xml': 'monthly',
    'sitemap-funds.xml': 'weekly',
    'sitemap-stocks.xml': 'monthly',
    'sitemap-smart-money.xml': 'monthly',
    'sitemap-tools.xml': 'monthly',
    'sitemap-blog.xml': 'monthly',
    'sitemap-learn.xml': 'monthly',
  };

  for (const name of CANONICAL_SITEMAP_INDEX) {
    if (name === 'sitemap-portfolio-overlap.xml') continue;

    const urls = buckets.get(name) || [];
    const count = writeUrlsetSync(writeFileSync, join(DIST, name), urls, {
      lastmod: LASTMOD,
      changefreq: changefreqByBucket[name] || 'weekly',
      priority: name === 'sitemap-ipos.xml' ? '0.8' : '0.7',
    });
    console.log(`  ✓ ${name} (${count} URLs)`);
  }
}

function removeLegacyFiles() {
  if (!existsSync(DIST)) return;

  for (const name of readdirSync(DIST)) {
    if (ASTRO_SITEMAP_RE.test(name)) {
      unlinkSync(join(DIST, name));
      continue;
    }
    if (LEGACY_SITEMAPS.includes(name)) {
      unlinkSync(join(DIST, name));
      continue;
    }
    if (/^sitemap-overlap-staging(-\w+)?\.xml$/.test(name)) {
      unlinkSync(join(DIST, name));
    }
  }
}

function main() {
  if (!existsSync(DIST)) {
    console.warn('  ⚠ reorganize-sitemaps: dist/ missing — skip');
    return;
  }

  const astroUrls = collectAstroUrls();
  const overlapUrls = collectOverlapStagingUrls();
  const allLocs = [...new Set([...astroUrls, ...overlapUrls])];

  if (!allLocs.length) {
    console.warn('  ⚠ reorganize-sitemaps: no URLs found — skip');
    return;
  }

  const buckets = bucketUrls(allLocs);
  writeBucketSitemaps(buckets);
  const overlapEntries = writePortfolioOverlapSitemap(buckets.get('sitemap-portfolio-overlap.xml') || overlapUrls);
  removeStaleOverlapSitemaps(overlapEntries);

  const indexEntries = buildSitemapIndexEntries(overlapEntries);
  writeSitemapIndexSync(writeFileSync, join(DIST, 'sitemap-index.xml'), indexEntries, LASTMOD);
  console.log(`  ✓ sitemap-index.xml (${indexEntries.length} child sitemaps, lastmod ${LASTMOD})`);

  removeLegacyFiles();
}

main();
