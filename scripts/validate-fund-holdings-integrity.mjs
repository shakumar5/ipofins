#!/usr/bin/env node
/**
 * Fail when fund holdings on disk are internally inconsistent.
 * Run: npm run validate:fund-holdings-integrity
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isInternationalEquityFund } from './lib/listing-codes.mjs';
import { resolveStockSlugFromListing, buildStockListingSlugLookupsFromDisk } from './lib/stock-slug-lookup.mjs';

const ROOT = process.cwd();
const BY_SLUG = join(ROOT, 'public', 'data', 'fund-holdings-by-slug');
const META_PATH = join(ROOT, 'public', 'data', 'fund-holdings-meta.json');
const ALIASES_PATH = join(ROOT, 'public', 'data', 'fund-holdings-aliases.json');

if (!existsSync(BY_SLUG)) {
  console.error('Missing fund-holdings-by-slug/');
  process.exit(1);
}

const meta = existsSync(META_PATH) ? JSON.parse(readFileSync(META_PATH, 'utf-8')) : { stockCounts: {} };
const aliases = existsSync(ALIASES_PATH) ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')) : {};
const lookups = buildStockListingSlugLookupsFromDisk();

const bySlugCounts = {};
for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const slug = fileName.replace(/\.json$/, '');
  const data = JSON.parse(readFileSync(join(BY_SLUG, fileName), 'utf-8'));
  bySlugCounts[slug] = Array.isArray(data.stocks) ? data.stocks.length : 0;
}

let errors = 0;

for (const [slug, metaCount] of Object.entries(meta.stockCounts || {})) {
  const base = slug.replace(/-holdings$/, '');
  const fileSlug = aliases[base] || base;
  const fileCount = bySlugCounts[fileSlug] ?? bySlugCounts[base] ?? 0;
  if (fileCount > 0 && metaCount !== fileCount) {
    console.error(`  ✗ count mismatch ${slug}: meta=${metaCount} file=${fileCount}`);
    errors++;
  }
}

for (const fileName of readdirSync(BY_SLUG)) {
  if (!fileName.endsWith('.json')) continue;
  const slug = fileName.replace(/\.json$/, '');
  const data = JSON.parse(readFileSync(join(BY_SLUG, fileName), 'utf-8'));
  const stocks = data.stocks || [];
  if (!stocks.length) continue;

  const international = isInternationalEquityFund(slug);
  let pctSum = 0;
  let missingCodes = 0;
  let missingSlug = 0;

  for (const row of stocks) {
    pctSum += Number(row.pct) || 0;
    const isin = String(row.isin || '').trim();
    const nse = String(row.nseSymbol || '').trim();
    const bse = String(row.bseCode || '').trim();
    if (!international && !isin && !nse && !bse) missingCodes++;

    const resolved =
      String(row.stockSlug || '').trim() ||
      resolveStockSlugFromListing(isin, nse, bse, lookups.isinMap, lookups.nseMap, lookups.bseMap);
    if (!international && !resolved) missingSlug++;
  }

  if (!international && missingCodes > 0) {
    console.error(`  ✗ ${slug}: ${missingCodes} Indian row(s) without ISIN/NSE/BSE`);
    errors++;
  }
  if (!international && missingSlug > stocks.length * 0.05) {
    console.error(`  ✗ ${slug}: ${missingSlug}/${stocks.length} rows without resolvable stock link`);
    errors++;
  }
  if (pctSum > 0 && !international && stocks.length >= 20) {
    const isEquityOnly = pctSum >= 70 && pctSum <= 115;
    if (!isEquityOnly && pctSum < 50) {
      console.error(`  ✗ ${slug}: equity weights sum to ${pctSum.toFixed(1)}% (incomplete portfolio in DB)`);
      errors++;
    }
  }
}

if (errors) {
  console.error(`\nvalidate:fund-holdings-integrity failed with ${errors} issue(s).`);
  process.exit(1);
}

console.log(`  ✓ fund holdings integrity OK (${Object.keys(bySlugCounts).length} files)`);
