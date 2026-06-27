#!/usr/bin/env node
/**
 * Audit stock_quarter_prices gaps vs stocks needing SHP/SI values.
 */
import { sql } from './lib/db.mjs';
import { requireDb } from './lib/db-writers.mjs';
import { fetchQuarterEndClose, clearPriceCache } from './lib/nse-quarter-price.mjs';

const quarterArg = (process.argv.find((a) => a.startsWith('--quarter=')) || '').split('=')[1];
const sampleRetry = process.argv.includes('--retry-sample');

async function main() {
  requireDb();

  const quarters = quarterArg
    ? [quarterArg]
    : (await sql`
        SELECT DISTINCT quarter::text AS q FROM (
          SELECT quarter FROM entity_holdings WHERE strategy_id IS NULL
          UNION SELECT quarter FROM shareholding_pattern_holders WHERE is_promoter = FALSE
        ) t ORDER BY q DESC
      `).map((r) => r.q);

  for (const quarter of quarters) {
    const rows = await sql`
      WITH need AS (
        SELECT DISTINCT s.id AS stock_id, s.name, s.nse_symbol, s.bse_code, s.isin
        FROM (
          SELECT stock_id FROM entity_holdings
          WHERE strategy_id IS NULL AND quarter = ${quarter}::date
          UNION
          SELECT stock_id FROM shareholding_pattern_holders
          WHERE quarter = ${quarter}::date AND is_promoter = FALSE AND pct_of_company >= 1.0
        ) u
        JOIN stocks s ON s.id = u.stock_id
      )
      SELECT
        n.stock_id,
        n.name,
        n.nse_symbol,
        n.bse_code,
        n.isin,
        sqp.close_price,
        CASE
          WHEN COALESCE(NULLIF(TRIM(n.nse_symbol), ''), NULLIF(TRIM(n.bse_code), '')) IS NULL THEN 'no_symbol'
          WHEN sqp.close_price IS NULL THEN 'missing_price'
          ELSE 'ok'
        END AS status
      FROM need n
      LEFT JOIN stock_quarter_prices sqp
        ON sqp.stock_id = n.stock_id AND sqp.quarter = ${quarter}::date
      ORDER BY status, n.name
    `;

    const missing = rows.filter((r) => r.status === 'missing_price');
    const noSymbol = rows.filter((r) => r.status === 'no_symbol');
    const ok = rows.filter((r) => r.status === 'ok');

    console.log(`\n📅 ${quarter}`);
    console.log(`   need pricing: ${rows.length} · ok: ${ok.length} · missing price: ${missing.length} · no symbol: ${noSymbol.length}`);

    if (noSymbol.length) {
      console.log('\n   No NSE/BSE symbol (sample 10):');
      for (const r of noSymbol.slice(0, 10)) {
        console.log(`     ${r.stock_id} | ${r.name} | isin=${r.isin || '—'}`);
      }
    }

    if (missing.length) {
      const nseOnly = missing.filter((r) => r.nse_symbol && !r.bse_code);
      const bseOnly = missing.filter((r) => !r.nse_symbol && r.bse_code);
      const both = missing.filter((r) => r.nse_symbol && r.bse_code);
      console.log(`\n   Missing price breakdown: NSE-only ${nseOnly.length} · BSE-only ${bseOnly.length} · both ${both.length}`);
      console.log('   Sample missing (15):');
      for (const r of missing.slice(0, 15)) {
        console.log(`     ${r.nse_symbol || '—'} | BSE ${r.bse_code || '—'} | ${r.name}`);
      }

      if (sampleRetry) {
        console.log('\n   Retry fetch (first 5 missing):');
        clearPriceCache();
        for (const r of missing.slice(0, 5)) {
          const px = await fetchQuarterEndClose(r.nse_symbol, quarter, r.bse_code);
          console.log(`     ${r.nse_symbol || r.bse_code} → ${px ?? 'null'}`);
        }
      }
    }
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
