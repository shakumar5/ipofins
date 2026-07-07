#!/usr/bin/env node
/**
 * Smoke tests for canonical pathname parsing (trailing-slash tolerance).
 * Mirrors src/lib/pathname.ts + client pathname parsers used on prod.
 */
import assert from 'node:assert/strict';

function pathnameWithoutTrailingSlash(pathname) {
  return pathname.replace(/\/+$/, '') || '/';
}

const STOCK_SIGNAL_BASE = '/mutual-funds/smart-money/stock-signal';
const PORTFOLIO_OVERLAP_BASE = '/mutual-funds/portfolio-overlap-checker';
const DELIMITER = '-vs-';

function parseStockSignalSlug(pathname) {
  const normalized = pathnameWithoutTrailingSlash(pathname);
  if (!normalized.startsWith(STOCK_SIGNAL_BASE)) return null;
  const rest = normalized.slice(STOCK_SIGNAL_BASE.length).replace(/^\//, '');
  if (!rest || rest.includes('/')) return null;
  return decodeURIComponent(rest);
}

function parseComparisonSlugs(pathname) {
  const normalized = pathnameWithoutTrailingSlash(pathname);
  if (!normalized.startsWith(PORTFOLIO_OVERLAP_BASE)) return [];
  const rest = normalized.slice(PORTFOLIO_OVERLAP_BASE.length).replace(/^\//, '');
  if (!rest) return [];
  return rest.split(DELIMITER).filter(Boolean);
}

function categoryFromPath(pathname, basePath, slugToCat) {
  const normalized = pathnameWithoutTrailingSlash(pathname);
  const base = pathnameWithoutTrailingSlash(basePath);
  if (normalized === base) return 'All';
  const prefix = `${base}/`;
  if (!normalized.startsWith(prefix)) return 'All';
  const slug = normalized.slice(prefix.length);
  return slugToCat(slug) ?? 'All';
}

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

console.log('verify-pathname-parsers.mjs');

test('pathnameWithoutTrailingSlash keeps root', () => {
  assert.equal(pathnameWithoutTrailingSlash('/'), '/');
  assert.equal(pathnameWithoutTrailingSlash('///'), '/');
});

test('stock signal slug with trailing slash', () => {
  assert.equal(
    parseStockSignalSlug('/mutual-funds/smart-money/stock-signal/360-one-wam-ltd/'),
    '360-one-wam-ltd',
  );
  assert.equal(
    parseStockSignalSlug('/mutual-funds/smart-money/stock-signal/360-one-wam-ltd'),
    '360-one-wam-ltd',
  );
});

test('portfolio overlap slugs with trailing slash', () => {
  assert.deepEqual(
    parseComparisonSlugs('/mutual-funds/portfolio-overlap-checker/fund-a-vs-fund-b/'),
    ['fund-a', 'fund-b'],
  );
});

test('fund category slug with trailing slash', () => {
  const slugToCat = (slug) => (slug === 'large-cap-mutual-funds' ? 'Large Cap' : null);
  assert.equal(
    categoryFromPath('/mutual-funds/all/large-cap-mutual-funds/', '/mutual-funds/all', slugToCat),
    'Large Cap',
  );
});

test('write-vercel-output-config includes trailing-slash redirect', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const hasRedirect = vercel.redirects?.some(
    (r) => r.source === '/:path+/' && r.destination === '/:path+',
  );
  assert.ok(hasRedirect, 'vercel.json missing /:path+/ → /:path+ redirect');
  const edge = readFileSync(join(root, 'scripts', 'write-vercel-output-config.mjs'), 'utf8');
  assert.match(edge, /\/\(\.\+\)\//, 'write-vercel-output-config missing trailing-slash route');
});

if (failed > 0) process.exit(1);
console.log('  All pathname parser checks passed.');
