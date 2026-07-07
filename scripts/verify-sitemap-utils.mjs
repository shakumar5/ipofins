#!/usr/bin/env node
/** Smoke tests for sitemap classification helpers (no dist/ build required). */
import assert from 'node:assert/strict';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  CANONICAL_SITEMAP_INDEX,
  PORTFOLIO_OVERLAP_HUB_PATH,
  REQUIRED_SITEMAP_HUB_PATHS,
  SITEMAP_EXCLUDED_PATH_PREFIXES,
  SITE,
  TOP_STOCKS_DEFAULT_COMBO_PATH,
  classifySitemapBucket,
  collectTopStocksFilterSitemapUrls,
  escapeXml,
  findForbiddenSitemapPaths,
  isAstroDefaultSitemapFile,
  isFundDetailPath,
  isPortfolioOverlapRewritePath,
  locToDistHtml,
  parseSitemapIndexChildNames,
  parseUrlsetLocs,
  pathnameFromLoc,
} from './lib/sitemap-utils.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ❌ ${name}: ${err.message}`);
    failed += 1;
  }
}

console.log('verify-sitemap-utils.mjs');

test('CANONICAL_SITEMAP_INDEX includes top-stocks bucket', () => {
  assert.ok(CANONICAL_SITEMAP_INDEX.includes('sitemap-top-stocks.xml'));
  assert.equal(CANONICAL_SITEMAP_INDEX.filter((n) => n === 'sitemap-top-stocks.xml').length, 1);
});

test('REQUIRED_SITEMAP_HUB_PATHS includes /top-stocks', () => {
  assert.ok(REQUIRED_SITEMAP_HUB_PATHS.includes('/top-stocks'));
});

test('classify /top-stocks → sitemap-top-stocks.xml', () => {
  assert.equal(classifySitemapBucket('/top-stocks'), 'sitemap-top-stocks.xml');
});

test('classify does not put super-investors or 1% club in top-stocks', () => {
  assert.equal(classifySitemapBucket('/super-investors'), 'sitemap-super-investors.xml');
  assert.equal(classifySitemapBucket('/1-percent-club'), 'sitemap-one-percent-club.xml');
  assert.equal(classifySitemapBucket('/1-percent-club/reliance'), 'sitemap-one-percent-club.xml');
});

test('classify mutual-funds routes', () => {
  assert.equal(classifySitemapBucket('/mutual-funds'), 'sitemap-mutual-funds.xml');
  assert.equal(classifySitemapBucket('/mutual-funds/smart-money'), 'sitemap-smart-money.xml');
  assert.equal(
    classifySitemapBucket('/mutual-funds/smart-money/sector-intelligence/banks'),
    'sitemap-smart-money.xml',
  );
  // Overlap hub page stays in the mutual-funds sitemap (indexable); only the
  // "-vs-" comparison deep links go to the overlap bucket (excluded from the index).
  assert.equal(
    classifySitemapBucket('/mutual-funds/portfolio-overlap-checker'),
    'sitemap-mutual-funds.xml',
  );
  assert.equal(
    classifySitemapBucket('/mutual-funds/portfolio-overlap-checker/fund-a-vs-fund-b'),
    'sitemap-portfolio-overlap.xml',
  );
  assert.equal(
    classifySitemapBucket('/mutual-funds/fund/sbi-bluechip'),
    'sitemap-funds.xml',
  );
});

test('classify tools/blog/learn/broker fallbacks', () => {
  assert.equal(classifySitemapBucket('/tools'), 'sitemap-tools.xml');
  assert.equal(classifySitemapBucket('/broker'), 'sitemap-tools.xml');
  assert.equal(classifySitemapBucket('/blogs'), 'sitemap-blog.xml');
  assert.equal(classifySitemapBucket('/learn'), 'sitemap-learn.xml');
  assert.equal(classifySitemapBucket('/about'), 'sitemap-tools.xml');
});

test('pathnameFromLoc normalizes trailing slash', () => {
  assert.equal(pathnameFromLoc(`${SITE}/top-stocks/`), '/top-stocks');
  assert.equal(pathnameFromLoc(`${SITE}/`), '/');
});

test('isAstroDefaultSitemapFile matches Astro urlsets only', () => {
  assert.equal(isAstroDefaultSitemapFile('sitemap-0.xml'), true);
  assert.equal(isAstroDefaultSitemapFile('sitemap-0-0.xml'), true);
  assert.equal(isAstroDefaultSitemapFile('sitemap-index.xml'), false);
  assert.equal(isAstroDefaultSitemapFile('sitemap-ipos.xml'), false);
  assert.equal(isAstroDefaultSitemapFile('sitemap-top-stocks.xml'), false);
});

test('parseUrlsetLocs extracts locs', () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>${SITE}/top-stocks</loc></url>
    <url><loc>${SITE}/ipo</loc></url>
  </urlset>`;
  assert.deepEqual(parseUrlsetLocs(xml), [`${SITE}/top-stocks`, `${SITE}/ipo`]);
});

test('parseSitemapIndexChildNames filters xml children only', () => {
  const index = `<?xml version="1.0"?><sitemapindex>
    <sitemap><loc>${SITE}/sitemap-top-stocks.xml</loc></sitemap>
    <sitemap><loc>${SITE}/sitemap-ipos.xml</loc></sitemap>
  </sitemapindex>`;
  assert.deepEqual(parseSitemapIndexChildNames(index), [
    'sitemap-top-stocks.xml',
    'sitemap-ipos.xml',
  ]);
});

test('isFundDetailPath detects fund holdings pages (canonical + alias)', () => {
  assert.equal(isFundDetailPath('/mutual-funds/fund/sbi-bluechip-holdings'), true);
  assert.equal(
    isFundDetailPath('/mutual-funds/fund/hdfc-mid-cap-fund-growth-option-direct-plan-holdings'),
    true,
  );
  // Non fund-detail paths must not match (so the canonical filter never touches them).
  assert.equal(isFundDetailPath('/mutual-funds/fund/'), false);
  assert.equal(isFundDetailPath('/mutual-funds/portfolio-overlap-checker'), false);
  assert.equal(isFundDetailPath('/mutual-funds'), false);
  assert.equal(isFundDetailPath('/top-stocks'), false);
});

test('collectTopStocksFilterSitemapUrls excludes the default combo (canonicalizes to hub)', () => {
  const urls = collectTopStocksFilterSitemapUrls();
  // 4 sources × 4 caps × 2 flows = 32 combos, minus the default combo = 31.
  assert.equal(urls.length, 31);
  assert.ok(!urls.includes(`${SITE}${TOP_STOCKS_DEFAULT_COMBO_PATH}`));
  // A non-default combo is still present.
  assert.ok(urls.includes(`${SITE}/top-stocks/mutual-funds/large/distribution`));
});

test('findForbiddenSitemapPaths flags fund alias + default-combo leaks', () => {
  const canonicalFundPaths = new Set([
    '/mutual-funds/fund/hdfc-mid-cap-fund-growth-option-direct-plan-holdings',
  ]);
  const paths = [
    '/', // ignored
    '/mutual-funds/fund/hdfc-mid-cap-fund-growth-option-direct-plan-holdings', // canonical → ok
    '/mutual-funds/fund/hdfc-mid-cap-fund-holdings', // alias → leak
    TOP_STOCKS_DEFAULT_COMBO_PATH, // default combo → leak
    '/top-stocks/mutual-funds/large/distribution', // non-default combo → ok
  ];
  const { fundAliasLeaks, defaultComboLeaks } = findForbiddenSitemapPaths(paths, {
    canonicalFundPaths,
  });
  assert.deepEqual(fundAliasLeaks, ['/mutual-funds/fund/hdfc-mid-cap-fund-holdings']);
  assert.deepEqual(defaultComboLeaks, [TOP_STOCKS_DEFAULT_COMBO_PATH]);
});

test('findForbiddenSitemapPaths skips fund check when canonical set is absent', () => {
  const paths = ['/mutual-funds/fund/anything-holdings', TOP_STOCKS_DEFAULT_COMBO_PATH];
  const { fundAliasLeaks, defaultComboLeaks } = findForbiddenSitemapPaths(paths, {});
  // No canonical set → do not flag fund URLs (mirrors reorganizer keep-all fallback).
  assert.deepEqual(fundAliasLeaks, []);
  // Default-combo guard still applies with or without the fund index.
  assert.deepEqual(defaultComboLeaks, [TOP_STOCKS_DEFAULT_COMBO_PATH]);
});

test('isPortfolioOverlapRewritePath detects comparison deep links', () => {
  const comparison = `${PORTFOLIO_OVERLAP_HUB_PATH}/fund-a-vs-fund-b`;
  assert.equal(isPortfolioOverlapRewritePath(comparison), true);
  assert.equal(isPortfolioOverlapRewritePath(PORTFOLIO_OVERLAP_HUB_PATH), false);
  assert.equal(isPortfolioOverlapRewritePath(`${PORTFOLIO_OVERLAP_HUB_PATH}/`), false);
  assert.equal(isPortfolioOverlapRewritePath('/mutual-funds/smart-money'), false);
});

test('locToDistHtml maps paths to index.html', () => {
  assert.equal(locToDistHtml(ROOT, '/'), join(ROOT, 'index.html'));
  assert.equal(locToDistHtml(ROOT, '/top-stocks'), join(ROOT, 'top-stocks', 'index.html'));
  assert.equal(
    locToDistHtml(ROOT, PORTFOLIO_OVERLAP_HUB_PATH),
    join(ROOT, 'mutual-funds', 'portfolio-overlap-checker', 'index.html'),
  );
});

test('escapeXml encodes special characters', () => {
  assert.equal(escapeXml('a & b < c'), 'a &amp; b &lt; c');
});

test('excluded path prefixes are defined for astro filter parity', () => {
  assert.ok(SITEMAP_EXCLUDED_PATH_PREFIXES.includes('/dashboard'));
  assert.ok(SITEMAP_EXCLUDED_PATH_PREFIXES.includes('/search'));
  assert.ok(SITEMAP_EXCLUDED_PATH_PREFIXES.includes('/1-percent-club/holder/'));
});

if (failed) {
  console.error(`\n  ❌ ${failed} test(s) failed`);
  process.exit(1);
}

console.log(`\n  ✓ all ${REQUIRED_SITEMAP_HUB_PATHS.length} required hub paths registered`);
