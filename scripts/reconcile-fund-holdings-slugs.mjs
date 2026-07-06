#!/usr/bin/env node
/**
 * Fill fund-holdings-by-slug/*.json with ISIN/NSE/BSE and resolve stockSlug via listing indexes only.
 * Drops Indian equity rows without ISIN/NSE/BSE.
 * Run: npm run reconcile:fund-holdings-slugs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEquityHoldingRow } from './lib/listing-codes.mjs';
import { unpackMonthHoldings, latestMonthForFund } from './lib/holdings-month.mjs';
import {
  buildStockListingSlugLookupsFromDisk,
  buildStockSlugListingLookupFromDisk,
  enrichHoldingListingCodes,
  resolveStockSlugFromListing,
  writeStockListingSlugIndexFiles,
} from './lib/stock-slug-lookup.mjs';

const dir = join(process.cwd(), 'public', 'data', 'fund-holdings-by-slug');
if (!existsSync(dir)) {
  console.error('Missing fund-holdings-by-slug/');
  process.exit(1);
}

function mapStockRow(h, lookups, slugListing) {
  const listing = enrichHoldingListingCodes(h, slugListing);
  const normalized = normalizeEquityHoldingRow(
    {
      ...h,
      isin: listing.isin,
      nseSymbol: listing.nseSymbol,
      bseCode: listing.bseCode,
    },
    { enrichFromSlug: false },
  );
  if (!normalized) return null;
  return {
    name: normalized.name,
    stockSlug: resolveStockSlugFromListing(
      normalized.isin,
      normalized.nseSymbol,
      normalized.bseCode,
      lookups.isinMap,
      lookups.nseMap,
      lookups.bseMap,
    ),
    isin: normalized.isin,
    nseSymbol: normalized.nseSymbol,
    bseCode: normalized.bseCode,
    sector: normalized.sector || '',
    pct: normalized.pct ?? 0,
  };
}

function writeFundFile(slug, fund, month, lookups, slugListing) {
  const { stocks } = unpackMonthHoldings(fund[month]);
  const mapped = stocks.map((h) => mapStockRow(h, lookups, slugListing)).filter(Boolean);
  if (!mapped.length) return false;
  writeFileSync(
    join(dir, `${slug}.json`),
    JSON.stringify({ slug, month, stocks: mapped }),
  );
  return true;
}

function rewriteFromSourceJson(lookups, slugListing) {
  const path = join(process.cwd(), 'src', 'data', 'fund-holdings.json');
  if (!existsSync(path)) return 0;
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  const months = raw.months || [];
  let count = 0;
  for (const [slug, fund] of Object.entries(raw.holdings || {})) {
    const month = latestMonthForFund(fund, months);
    if (!month) continue;
    if (writeFundFile(slug, fund, month, lookups, slugListing)) count++;
    const directSlug = `${slug}-direct-plan`;
    if (!raw.holdings[directSlug] && writeFundFile(directSlug, fund, month, lookups, slugListing)) count++;
  }
  return count;
}

const counts = writeStockListingSlugIndexFiles();
console.log(`Listing indexes — ISIN ${counts.isin}, NSE ${counts.nse}, BSE ${counts.bse}`);

const lookups = buildStockListingSlugLookupsFromDisk();
const slugListing = buildStockSlugListingLookupFromDisk();
const rewritten = rewriteFromSourceJson(lookups, slugListing);
if (rewritten) {
  console.log(`Rewrote ${rewritten} fund file(s) from fund-holdings.json with ISIN/NSE/BSE.`);
  console.log('Done.');
  process.exit(0);
}

let files = 0;
let enriched = 0;
let dropped = 0;

for (const fileName of readdirSync(dir)) {
  if (!fileName.endsWith('.json')) continue;
  const filePath = join(dir, fileName);
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    continue;
  }
  if (!Array.isArray(data.stocks)) continue;

  const before = data.stocks.length;
  let changed = false;
  data.stocks = data.stocks
    .map((row) => {
      const next = mapStockRow(row, lookups, slugListing);
      if (!next) return null;
      if (
        next.isin !== (row.isin || '')
        || next.nseSymbol !== (row.nseSymbol || row.nse_symbol || '')
        || next.bseCode !== (row.bseCode || row.bse_code || '')
        || next.stockSlug !== (row.stockSlug || '')
      ) {
        changed = true;
        if (next.stockSlug && next.stockSlug !== (row.stockSlug || '')) enriched++;
      }
      return next;
    })
    .filter(Boolean);

  if (data.stocks.length < before) {
    dropped += before - data.stocks.length;
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(data));
    files++;
  }
}

console.log(`Done — ${enriched} slugs resolved, ${dropped} rows dropped, ${files} fund file(s) updated.`);
