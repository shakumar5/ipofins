#!/usr/bin/env node
/**
 * Backfill ISIN/NSE/BSE on fund-holdings-by-slug rows, drop rows without listing codes,
 * and re-resolve stockSlug via listing indexes only.
 * Run: npm run backfill:holdings-listing-codes
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEquityHoldingRow } from './lib/listing-codes.mjs';
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

const counts = writeStockListingSlugIndexFiles();
console.log(
  `Listing indexes — ISIN ${counts.isin}, NSE ${counts.nse}, BSE ${counts.bse}, slug listing ${counts.slugListing}`,
);

const lookups = buildStockListingSlugLookupsFromDisk();
const slugListing = buildStockSlugListingLookupFromDisk();

let files = 0;
let codesBackfilled = 0;
let slugsResolved = 0;
let rowsDropped = 0;

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
      const hadCodes = Boolean(
        String(row.isin || '').trim()
        || String(row.nseSymbol || row.nse_symbol || '').trim()
        || String(row.bseCode || row.bse_code || '').trim(),
      );
      const listing = enrichHoldingListingCodes(row, slugListing);
      const normalized = normalizeEquityHoldingRow(
        {
          ...row,
          isin: listing.isin,
          nseSymbol: listing.nseSymbol,
          bseCode: listing.bseCode,
        },
        { enrichFromSlug: false },
      );
      if (!normalized) return null;

      const resolved = resolveStockSlugFromListing(
        normalized.isin,
        normalized.nseSymbol,
        normalized.bseCode,
        lookups.isinMap,
        lookups.nseMap,
        lookups.bseMap,
      );

      const next = {
        ...row,
        name: normalized.name,
        isin: normalized.isin,
        nseSymbol: normalized.nseSymbol,
        bseCode: normalized.bseCode,
        stockSlug: resolved || '',
      };

      if (
        next.isin !== (row.isin || '')
        || next.nseSymbol !== (row.nseSymbol || row.nse_symbol || '')
        || next.bseCode !== (row.bseCode || row.bse_code || '')
        || next.stockSlug !== (row.stockSlug || '')
      ) {
        changed = true;
        if (!hadCodes && (next.isin || next.nseSymbol || next.bseCode)) codesBackfilled++;
        if (resolved) slugsResolved++;
      }
      return next;
    })
    .filter(Boolean);

  if (data.stocks.length < before) {
    rowsDropped += before - data.stocks.length;
    changed = true;
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(data));
    files++;
  }
}

console.log(
  `Done — ${codesBackfilled} rows gained listing codes, ${slugsResolved} slugs resolved, ${rowsDropped} rows dropped (no ISIN/NSE/BSE), ${files} file(s) updated.`,
);
