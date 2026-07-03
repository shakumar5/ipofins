#!/usr/bin/env node
/**
 * Apply market_cap_category from AMFI average market-cap Excel to existing stocks.
 *
 * Match uses the same identity order as stock-listing-key: ISIN first, then NSE
 * symbol only when the stock row has no ISIN. Does not seed ISIN/NSE/BSE — those
 * come from db:seed-listed-equities and db:seed-bse-listed-equities.
 *
 * Usage: npm run db:seed-amfi-market-cap
 */

import { isDbConfigured, sql } from '../../scripts/lib/db.mjs';
import { bulkApplyAmfiMarketCapCategories, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { findLatestAmfiMarketCapFile, parseAmfiMarketCapFile } from '../../scripts/lib/amfi-market-cap.mjs';

async function main() {
  if (!isDbConfigured()) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const file = findLatestAmfiMarketCapFile();
  if (!file) {
    console.error('No AMFI market-cap xlsx in data/amfi-excel/');
    process.exit(1);
  }

  console.log(`Parsing AMFI market cap: ${file}`);
  const amfiRows = parseAmfiMarketCapFile(file);
  console.log(`  ${amfiRows.length} ranked companies in file`);

  const rows = amfiRows
    .filter((r) => r.marketCapCategory)
    .map((r) => ({
      isin: r.isin,
      nse_symbol: r.nseSymbol,
      market_cap_category: r.marketCapCategory,
    }));

  const { byIsin, byNseFallback } = await bulkApplyAmfiMarketCapCategories(rows);
  console.log(`  Cap buckets applied — by ISIN: ${byIsin}, NSE fallback: ${byNseFallback}`);

  const [{ count: classified }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM stocks
    WHERE market_cap_category IN ('large', 'mid', 'small', 'micro')
  `;
  console.log(`  Total classified stocks in DB: ${classified}`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => closePgPool());
