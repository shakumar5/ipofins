/**
 * Post-build: replace Astro's default sitemap output with categorized child sitemaps
 * and a clean sitemap-index.xml (canonical buckets + lastmod).
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
  collectSmartMoneySignalFilterSitemapUrls,
  collectTopStocksFilterSitemapUrls,
  isFundDetailPath,
  TOP_STOCKS_DEFAULT_COMBO_PATH,
  parseUrlsetLocs,
  pathnameFromLoc,
  todayIso,
  writeSitemapIndexSync,
  writeUrlsetSync,
} from './lib/sitemap-utils.mjs';
import {
  buildOverlapUrls,
  collectStagingUrlsFromDir,
  findPrebuiltOverlapSitemaps,
  loadFundsFromPortfolioJson,
} from './lib/portfolio-overlap-sitemap.mjs';

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
  const fromDist = collectStagingUrlsFromDir(DIST);
  const fromPublic = collectStagingUrlsFromDir(join(ROOT, 'public'));
  return [...new Set([...fromDist, ...fromPublic])];
}

function collectOverlapUrlsFromJson() {
  const funds = loadFundsFromPortfolioJson(ROOT);
  return funds ? buildOverlapUrls(funds) : [];
}

/**
 * Canonical fund detail paths (/mutual-funds/fund/<slug>-holdings) that are
 * indexable and self-canonical. Built from fund-holdings-index.json — the same
 * source getFundsWithHoldings() uses to generate the pages — so it matches the
 * build exactly. Alias slugs (AMFI/listable variants) get emitted by Astro as
 * noindex meta-refresh redirects and must NOT be advertised in the sitemap.
 *
 * Returns null when the index is unavailable/empty so we fall back to keeping all
 * fund URLs rather than shipping an empty funds sitemap.
 */
function loadCanonicalFundPaths() {
  for (const base of [join(ROOT, 'public', 'data'), join(DIST, 'data')]) {
    const path = join(base, 'fund-holdings-index.json');
    if (!existsSync(path)) continue;
    try {
      const index = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(index) || !index.length) return null;
      const paths = new Set(
        index
          .map((f) => f?.slug)
          .filter(Boolean)
          .map((slug) => `/mutual-funds/fund/${slug}-holdings`),
      );
      return paths.size ? paths : null;
    } catch {
      return null;
    }
  }
  return null;
}

function bucketUrls(allLocs, canonicalFundPaths) {
  const buckets = new Map(CANONICAL_SITEMAP_INDEX.map((name) => [name, []]));
  let droppedFundAliases = 0;

  for (const loc of allLocs) {
    const path = pathnameFromLoc(loc);
    if (!path || path === '/404') continue;
    if (path.startsWith('/1-percent-club/holder/')) continue;
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

/**
 * Build the sitemap-index child list.
 *
 * Portfolio overlap "-vs-" comparison sitemaps are intentionally EXCLUDED: every
 * comparison URL serves the shared hub HTML whose <link rel="canonical"> points to
 * the hub, so submitting tens of thousands of them made Google report
 * "Duplicate, Google chose different canonical than user". Withdrawing them from the
 * index is the recommended way to stop submitting those URLs. The hub page itself
 * still ships in sitemap-mutual-funds.xml (see classifySitemapBucket), so it stays
 * indexable. The urlset files are still generated (build verifier depends on them)
 * but are no longer referenced by sitemap-index.xml.
 */
function buildSitemapIndexEntries() {
  return CANONICAL_SITEMAP_INDEX.filter((name) => name !== 'sitemap-portfolio-overlap.xml');
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
    'sitemap-super-investors.xml': 'weekly',
    'sitemap-one-percent-club.xml': 'weekly',
    'sitemap-top-stocks.xml': 'weekly',
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
    if (/^sitemap-overlap-staging-\d+\.xml$/.test(name)) {
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
  const overlapStagingUrls = collectOverlapStagingUrls();
  const allLocs = [
    ...new Set([
      ...astroUrls,
      ...overlapStagingUrls,
      ...collectTopStocksFilterSitemapUrls(),
      ...collectSmartMoneySignalFilterSitemapUrls(),
    ]),
  ];

  if (!allLocs.length) {
    console.warn('  ⚠ reorganize-sitemaps: no URLs found — skip');
    return;
  }

  const canonicalFundPaths = loadCanonicalFundPaths();
  if (!canonicalFundPaths) {
    console.warn('  ⚠ fund-holdings-index.json unavailable — keeping all fund URLs (alias redirects included)');
  }
  const buckets = bucketUrls(allLocs, canonicalFundPaths);
  writeBucketSitemaps(buckets);

  const prebuilt = findPrebuiltOverlapSitemaps(DIST);
  let overlapEntries;
  if (prebuilt.length) {
    overlapEntries = prebuilt;
    console.log(`  ✓ using ${prebuilt.length} prebuilt portfolio overlap sitemap(s) from public/`);
  } else {
    const overlapUrls = [
      ...new Set([
        ...(buckets.get('sitemap-portfolio-overlap.xml') || []),
        ...collectOverlapStagingUrls(),
        ...collectOverlapUrlsFromJson(),
      ]),
    ];
    if (!overlapUrls.length) {
      console.error('  ❌ No portfolio overlap URLs found (staging + JSON both empty)');
      process.exit(1);
    }
    overlapEntries = writePortfolioOverlapSitemap(overlapUrls);
  }

  removeStaleOverlapSitemaps(overlapEntries);

  const indexEntries = buildSitemapIndexEntries();
  writeSitemapIndexSync(writeFileSync, join(DIST, 'sitemap-index.xml'), indexEntries, LASTMOD);
  console.log(`  ✓ sitemap-index.xml (${indexEntries.length} child sitemaps, lastmod ${LASTMOD})`);

  removeLegacyFiles();
}

main();
