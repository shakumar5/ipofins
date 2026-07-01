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
  classifySitemapBucket,
  escapeXml,
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
    classifySitemapBucket('/mutual-funds/portfolio-overlap-checker'),
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
