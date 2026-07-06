#!/usr/bin/env node
/**
 * Sync fund-holdings-by-slug/*.json from the authoritative source:
 *   - DATABASE_URL set → fund_holdings table only (exact AMC disclosure rows in DB)
 *   - else → src/data/fund-holdings.json parser output
 *
 * Run: npm run restore:fund-holdings-from-parser
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDbConfigured } from './lib/db.mjs';
import { loadHoldingsFromJson, loadHoldingsFromDb, overlayInternationalHoldingsFromParser } from './lib/holdings-data-merge.mjs';
import { writeFundHoldingsBySlugFromMergedHoldings, readBySlugFile } from './lib/fund-holdings-by-slug-write.mjs';
import {
  buildStockListingSlugLookupsFromDisk,
  buildStockSlugListingLookupFromDisk,
  writeStockListingSlugIndexFiles,
} from './lib/stock-slug-lookup.mjs';

const ROOT = process.cwd();
const SOURCE = join(ROOT, 'src', 'data', 'fund-holdings.json');
const OUT = join(ROOT, 'public', 'data', 'fund-holdings-by-slug');
const ALIASES_PATH = join(ROOT, 'public', 'data', 'fund-holdings-aliases.json');

if (!existsSync(SOURCE) && !isDbConfigured()) {
  console.error('Missing src/data/fund-holdings.json and no DATABASE_URL — nothing to sync.');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const counts = writeStockListingSlugIndexFiles();
console.log(`Listing indexes — ISIN ${counts.isin}, NSE ${counts.nse}, BSE ${counts.bse}, bhavcopy ${counts.bhavcopyIsin || 0}`);

let holdings = null;
let authoritative = false;

if (isDbConfigured()) {
  try {
    holdings = await loadHoldingsFromDb();
    authoritative = true;
    console.log(`  ✓ Authoritative source: DB (${Object.keys(holdings.holdings || {}).length} funds)`);
  } catch (e) {
    console.warn(`  ⚠ DB load failed: ${e.message}`);
  }
}

if (!holdings) {
  holdings = loadHoldingsFromJson(ROOT);
  if (holdings) {
    console.log(`  ℹ Fallback source: parser JSON (${Object.keys(holdings.holdings || {}).length} funds)`);
  }
} else {
  const parserHoldings = loadHoldingsFromJson(ROOT);
  if (parserHoldings) {
    holdings = overlayInternationalHoldingsFromParser(holdings, parserHoldings);
  }
}

if (!holdings?.holdings || !Object.keys(holdings.holdings).length) {
  console.error('No holdings to sync.');
  process.exit(1);
}

const lookups = buildStockListingSlugLookupsFromDisk();
const slugListing = buildStockSlugListingLookupFromDisk();
const { written, rows } = writeFundHoldingsBySlugFromMergedHoldings(
  holdings,
  OUT,
  lookups,
  slugListing,
  { force: authoritative },
);

console.log(`Synced ${rows} holdings across ${written} fund file(s).`);

const aliases = existsSync(ALIASES_PATH) ? JSON.parse(readFileSync(ALIASES_PATH, 'utf-8')) : {};

let copied = 0;
const exportedSlugs = new Set(Object.keys(holdings.holdings || {}));
for (const [listable, canonical] of Object.entries(aliases)) {
  if (!listable || !canonical || listable === canonical) continue;
  const sourceSlug = exportedSlugs.has(canonical)
    ? canonical
    : exportedSlugs.has(listable)
      ? listable
      : null;
  if (!sourceSlug) continue;
  const source = readBySlugFile(OUT, sourceSlug);
  if (!source?.stocks?.length) continue;
  for (const slug of new Set([listable, canonical])) {
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify({ ...source, slug }));
    copied++;
  }
}
if (copied) console.log(`  ✓ alias slug sync from DB export (${copied} file(s))`);

const reconcile = join(ROOT, 'scripts', 'reconcile-holdings-meta.mjs');
const result = spawnSync(process.execPath, [reconcile], { stdio: 'inherit', cwd: ROOT });
if (result.status !== 0) {
  console.warn('  ⚠ reconcile-holdings-meta failed — run npm run reconcile:holdings-meta');
}
