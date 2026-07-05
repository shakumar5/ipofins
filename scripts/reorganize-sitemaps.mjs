/**
 * Post-build: replace Astro's default sitemap output with categorized child sitemaps
 * and a clean sitemap-index.xml (canonical buckets + lastmod).
 *
 * GSC submits only sitemap-index.xml (~15k indexable pages). Portfolio overlap
 * comparison URLs (~143k) are never written to dist/.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  CANONICAL_SITEMAP_INDEX,
  SITE,
  classifySitemapBucket,
  collectSmartMoneySignalFilterSitemapUrls,
  collectTopStocksFilterSitemapUrls,
  isFundDetailPath,
  isPortfolioOverlapRewritePath,
  loadCanonicalFundPaths,
  TOP_STOCKS_DEFAULT_COMBO_PATH,
  parseUrlsetLocs,
  pathnameFromLoc,
  todayIso,
  writeSitemapIndexSync,
  writeUrlsetSync,
} from './lib/sitemap-utils.mjs';

import { removeNonIndexableSitemapFiles } from './lib/cleanup-non-indexable-sitemaps.mjs';

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

/** Directories to search for the fund holdings index, most-specific first. */
const FUND_INDEX_DATA_DIRS = [join(ROOT, 'public', 'data'), join(DIST, 'data')];

function bucketUrls(allLocs, canonicalFundPaths) {
  const buckets = new Map(CANONICAL_SITEMAP_INDEX.map((name) => [name, []]));
  let droppedFundAliases = 0;
  let droppedOverlapComparisons = 0;

  for (const loc of allLocs) {
    const path = pathnameFromLoc(loc);
    if (!path || path === '/404') continue;
    if (path.startsWith('/1-percent-club/holder/')) continue;
    if (isPortfolioOverlapRewritePath(path)) {
      droppedOverlapComparisons += 1;
      continue;
    }
    // Default Top Stocks combo canonicalizes to the /top-stocks hub — never list
    // it (hub is already in the sitemap) to avoid GSC "Duplicate canonical".
    if (path === TOP_STOCKS_DEFAULT_COMBO_PATH) continue;
    // Drop noindex fund alias redirect pages: keep only canonical fund pages so
    // the sitemap never advertises noindex/redirect URLs (GSC "Excluded by
    // noindex" / "Page with redirect" / "Duplicate canonical").
    if (canonicalFundPaths && isFundDetailPath(path) && !canonicalFundPaths.has(path)) {
      droppedFundAliases += 1;
      continue;
    }
    const bucket = classifySitemapBucket(path);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    // Always emit the normalized non-trailing-slash form (pathnameFromLoc strips it)
    // so sitemap URLs match the pages' canonical tags. Astro's raw sitemap uses
    // trailing slashes; mixing the two produced "Alternate/Duplicate canonical" in GSC.
    buckets.get(bucket).push(`${SITE}${path}`);
  }

  if (droppedFundAliases) {
    console.log(`  ✓ dropped ${droppedFundAliases} noindex fund alias redirect URLs from sitemap`);
  }
  if (droppedOverlapComparisons) {
    console.log(`  ✓ dropped ${droppedOverlapComparisons} portfolio overlap comparison URL(s) from sitemap (hub only)`);
  }

  return buckets;
}

/**
 * Build the sitemap-index child list.
 * Portfolio overlap comparison urlsets are excluded — only the hub is indexable.
 */
function buildSitemapIndexEntries() {
  return CANONICAL_SITEMAP_INDEX.filter((name) => name !== 'sitemap-portfolio-overlap.xml');
}

function writeBucketSitemaps(buckets) {
  const changefreqByBucket = {
    'sitemap-ipos.xml': 'weekly',
    'sitemap-mutual-funds.xml': 'weekly',
    'sitemap-amcs.xml': 'monthly',
    'sitemap-funds.xml': 'weekly',
    'sitemap-stocks.xml': 'monthly',
    'sitemap-smart-money.xml': 'monthly',
    'sitemap-super-investors.xml': 'weekly',
    'sitemap-one-percent-club.xml': 'weekly',
    'sitemap-top-stocks.xml': 'weekly',
    'sitemap-tools.xml': 'monthly',
    'sitemap-blog.xml': 'monthly',
    'sitemap-learn.xml': 'monthly',
  };

  let indexedUrlCount = 0;

  for (const name of CANONICAL_SITEMAP_INDEX) {
    if (name === 'sitemap-portfolio-overlap.xml') continue;

    const urls = buckets.get(name) || [];
    const count = writeUrlsetSync(writeFileSync, join(DIST, name), urls, {
      lastmod: LASTMOD,
      changefreq: changefreqByBucket[name] || 'weekly',
      priority: name === 'sitemap-ipos.xml' ? '0.8' : '0.7',
    });
    indexedUrlCount += count;
    console.log(`  ✓ ${name} (${count} URLs)`);
  }

  return indexedUrlCount;
}

function removeNonIndexableSitemapFilesFromDist() {
  if (!existsSync(DIST)) return;

  for (const name of readdirSync(DIST)) {
    if (ASTRO_SITEMAP_RE.test(name)) {
      unlinkSync(join(DIST, name));
      continue;
    }
    if (LEGACY_SITEMAPS.includes(name)) {
      unlinkSync(join(DIST, name));
    }
  }

  const removed = removeNonIndexableSitemapFiles(DIST);
  if (removed) {
    console.log(`  ✓ removed ${removed} non-indexable overlap sitemap file(s) from dist/`);
  }
}

function main() {
  if (!existsSync(DIST)) {
    console.warn('  ⚠ reorganize-sitemaps: dist/ missing — skip');
    return;
  }

  const removedBefore = removeNonIndexableSitemapFiles(DIST);
  if (removedBefore) {
    console.log(`  ✓ removed ${removedBefore} non-indexable overlap sitemap file(s) from dist/`);
  }

  const astroUrls = collectAstroUrls();
  const allLocs = [
    ...new Set([
      ...astroUrls,
      ...collectTopStocksFilterSitemapUrls(),
      ...collectSmartMoneySignalFilterSitemapUrls(),
    ]),
  ];

  if (!allLocs.length) {
    console.warn('  ⚠ reorganize-sitemaps: no URLs found — skip');
    removeNonIndexableSitemapFilesFromDist();
    return;
  }

  const canonicalFundPaths = loadCanonicalFundPaths(FUND_INDEX_DATA_DIRS);
  if (!canonicalFundPaths) {
    console.warn('  ⚠ fund-holdings-index.json unavailable — keeping all fund URLs (alias redirects included)');
  }
  const buckets = bucketUrls(allLocs, canonicalFundPaths);
  const indexedUrlCount = writeBucketSitemaps(buckets);

  const indexEntries = buildSitemapIndexEntries();
  writeSitemapIndexSync(writeFileSync, join(DIST, 'sitemap-index.xml'), indexEntries, LASTMOD);
  console.log(
    `  ✓ sitemap-index.xml (${indexEntries.length} child sitemaps, ${indexedUrlCount} indexable URLs, lastmod ${LASTMOD})`,
  );

  removeNonIndexableSitemapFilesFromDist();
}

main();
