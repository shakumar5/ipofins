#!/usr/bin/env node
/**
 * Fail the build if sitemap-index is incomplete or any urlset loc does not resolve
 * to a static HTML file in dist/ (portfolio overlap comparisons use hub rewrite).
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
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
    if (/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name)) {
      report(`sitemap-index must not reference portfolio overlap urlsets: ${name}`);
    }
    const path = join(DIST, name);
    if (!existsSync(path)) {
      report(`sitemap-index references missing file: ${name}`);
    }
  }

  if (existsSync(DIST)) {
    for (const name of readdirSync(DIST)) {
      if (/^sitemap-portfolio-overlap(-\d+)?\.xml$/.test(name)) {
        report(`portfolio overlap sitemap must not ship in dist/: ${name}`);
      }
      if (/^sitemap-overlap-staging-\d+\.xml$/.test(name)) {
        report(`overlap staging sitemap must not ship in dist/: ${name}`);
      }
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

  if (!allPaths.has(PORTFOLIO_OVERLAP_HUB_PATH)) {
    report(`Portfolio overlap hub missing from sitemaps: ${PORTFOLIO_OVERLAP_HUB_PATH}`);
  }

  for (const path of allPaths) {
    if (SITEMAP_EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      report(`Excluded path must not be in sitemap: ${path}`);
    }
    if (isPortfolioOverlapRewritePath(path)) {
      report(`Portfolio overlap comparison URL must not be in GSC sitemap: ${path}`);
    }
  }

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

  for (const loc of allLocs) {
    const path = pathnameFromLoc(loc);
    if (!path || path === '/404') continue;

    if (isPortfolioOverlapRewritePath(path)) {
      report(`Portfolio overlap comparison URL must not be in GSC sitemap: ${path}`);
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

  if (errors) {
    console.error(`  ❌ sitemap verification failed (${errors} issue(s), ${allLocs.length} GSC URLs)`);
    process.exit(1);
  }

  console.log(`  ✓ sitemap-index.xml OK (${childNames.length} child sitemaps, ${allLocs.length} GSC URLs, all resolve)`);
}

main();
