#!/usr/bin/env node
/**
 * Fail the build if sitemap-index is incomplete or any urlset loc does not resolve
 * to a static HTML file in dist/ (portfolio overlap comparisons use hub rewrite).
 */
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  REQUIRED_SITEMAP_HUB_PATHS,
  SITEMAP_EXCLUDED_PATH_PREFIXES,
  PORTFOLIO_OVERLAP_HUB_PATH,
  collectAllSitemapPaths,
  findForbiddenSitemapPaths,
  isPortfolioOverlapRewritePath,
  loadCanonicalFundPaths,
  locToDistHtml,
  parseSitemapIndexChildNames,
  parseUrlsetLocs,
  pathnameFromLoc,
} from './lib/sitemap-utils.mjs';
import { findPrebuiltOverlapSitemaps, parseUrlsetLocCount } from './lib/portfolio-overlap-sitemap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const INDEX = join(DIST, 'sitemap-index.xml');
const MAX_MISSING_REPORT = 25;

function main() {
  if (!existsSync(INDEX)) {
    console.error('  ❌ sitemap-index.xml missing in dist/');
    process.exit(1);
  }

  const indexXml = readFileSync(INDEX, 'utf8');
  const childNames = parseSitemapIndexChildNames(indexXml);

  let errors = 0;
  const report = (msg) => {
    console.error(`  ❌ ${msg}`);
    errors += 1;
  };

  for (const name of childNames) {
    const path = join(DIST, name);
    if (!existsSync(path)) {
      report(`sitemap-index references missing file: ${name}`);
      continue;
    }
    if (/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name) && parseUrlsetLocCount(path) === 0) {
      report(`${name} is empty (0 URLs)`);
    }
  }

  if (!childNames.includes('sitemap-top-stocks.xml')) {
    report('sitemap-index missing sitemap-top-stocks.xml');
  }

  const topStocksPath = join(DIST, 'sitemap-top-stocks.xml');
  if (existsSync(topStocksPath)) {
    const topStocksLocs = parseUrlsetLocs(readFileSync(topStocksPath, 'utf8'));
    if (!topStocksLocs.some((loc) => pathnameFromLoc(loc) === '/top-stocks')) {
      report('sitemap-top-stocks.xml does not include /top-stocks');
    }
  }

  const allPaths = collectAllSitemapPaths(DIST, childNames);
  const allLocs = [];
  for (const name of childNames) {
    const path = join(DIST, name);
    if (!existsSync(path)) continue;
    allLocs.push(...parseUrlsetLocs(readFileSync(path, 'utf8')));
  }

  for (const hub of REQUIRED_SITEMAP_HUB_PATHS) {
    const normalized = hub.replace(/\/$/, '') || '/';
    if (!allPaths.has(normalized)) {
      report(`Required hub missing from sitemaps: ${normalized}`);
    }
  }

  for (const path of allPaths) {
    if (SITEMAP_EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      report(`Excluded path must not be in sitemap: ${path}`);
    }
  }

  // Hygiene guard: fail loudly if reorganize-sitemaps.mjs ever regresses and lets
  // noindex fund alias redirects or the /top-stocks default combo (both
  // canonicalize elsewhere) back into the sitemap. Skips the fund check when the
  // holdings index is unavailable, mirroring the reorganizer's keep-all fallback.
  const canonicalFundPaths = loadCanonicalFundPaths([
    join(DIST, 'data'),
    join(ROOT, 'public', 'data'),
  ]);
  if (!canonicalFundPaths) {
    console.warn('  ⚠ fund-holdings-index.json unavailable — skipping fund alias sitemap guard');
  }
  const { fundAliasLeaks, defaultComboLeaks } = findForbiddenSitemapPaths(allPaths, {
    canonicalFundPaths,
  });
  if (defaultComboLeaks.length) {
    report(`Top Stocks default combo must not be in sitemap (canonicalizes to /top-stocks): ${defaultComboLeaks[0]}`);
  }
  if (fundAliasLeaks.length) {
    report(`${fundAliasLeaks.length} noindex fund alias URL(s) leaked into sitemap (expected only canonical -holdings pages)`);
    for (const p of fundAliasLeaks.slice(0, MAX_MISSING_REPORT)) {
      console.error(`       ${p}`);
    }
    if (fundAliasLeaks.length > MAX_MISSING_REPORT) {
      console.error(`       … and ${fundAliasLeaks.length - MAX_MISSING_REPORT} more`);
    }
  }
  if (canonicalFundPaths && !fundAliasLeaks.length && !defaultComboLeaks.length) {
    console.log(`  ✓ sitemap hygiene: no alias/default-combo leaks (${canonicalFundPaths.size} canonical fund pages)`);
  }

  const hubHtml = locToDistHtml(DIST, PORTFOLIO_OVERLAP_HUB_PATH);
  if (!existsSync(hubHtml)) {
    report(`Portfolio overlap hub HTML missing: ${hubHtml.replace(ROOT, '')}`);
  }

  const missingArtifacts = [];
  let overlapRewriteCount = 0;

  for (const loc of allLocs) {
    const path = pathnameFromLoc(loc);
    if (!path || path === '/404') continue;

    if (isPortfolioOverlapRewritePath(path)) {
      overlapRewriteCount += 1;
      continue;
    }

    const html = locToDistHtml(DIST, path);
    if (!existsSync(html)) {
      missingArtifacts.push({ path, html: html.replace(ROOT, '') });
    }
  }

  if (missingArtifacts.length) {
    report(`${missingArtifacts.length} sitemap URL(s) have no dist HTML artifact`);
    for (const item of missingArtifacts.slice(0, MAX_MISSING_REPORT)) {
      console.error(`       ${item.path} → expected ${item.html}`);
    }
    if (missingArtifacts.length > MAX_MISSING_REPORT) {
      console.error(`       … and ${missingArtifacts.length - MAX_MISSING_REPORT} more`);
    }
  }

  const overlapFiles = findPrebuiltOverlapSitemaps(DIST);
  const overlapUrls = overlapFiles.reduce(
    (sum, name) => sum + parseUrlsetLocCount(join(DIST, name)),
    0,
  );

  if (overlapUrls < 1000) {
    report(`portfolio overlap sitemaps have only ${overlapUrls} URLs (expected thousands)`);
  } else {
    console.log(`  ✓ portfolio overlap sitemaps: ${overlapFiles.length} file(s), ${overlapUrls} URLs`);
  }

  if (overlapRewriteCount > 0 && existsSync(hubHtml)) {
    console.log(`  ✓ ${overlapRewriteCount} portfolio overlap comparison URL(s) → hub rewrite`);
  }

  if (errors) {
    console.error(`  ❌ sitemap verification failed (${errors} issue(s), ${allLocs.length} total URLs)`);
    process.exit(1);
  }

  console.log(`  ✓ sitemap-index.xml OK (${childNames.length} child sitemaps, ${allLocs.length} URLs, all resolve)`);
}

main();
