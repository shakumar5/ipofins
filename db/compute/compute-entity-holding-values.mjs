#!/usr/bin/env node
/**
 * Compute entity_holdings.market_value_cr = shares × quarter-end close (Yahoo Finance).
 * Re-aggregates entity_quarterly_stats.portfolio_value_cr per affected quarter.
 *
 * Usage:
 *   node scripts/node-with-ca.mjs db/compute/compute-entity-holding-values.mjs
 *   node scripts/node-with-ca.mjs db/compute/compute-entity-holding-values.mjs -- --all-quarters
 *   node scripts/node-with-ca.mjs db/compute/compute-entity-holding-values.mjs -- --quarter=2026-01-01
 */

import { sql } from '../../scripts/lib/db.mjs';
import { requireDb } from '../../scripts/lib/db-writers.mjs';
import { mapPool } from '../../scripts/lib/pool.mjs';
import { fetchQuarterEndClose, holdingValueCr, clearPriceCache } from '../../scripts/lib/nse-quarter-price.mjs';
import { inferLatestQuarter } from '../../scripts/lib/si-quarters.mjs';

const args = process.argv.slice(2);
const allQuarters = args.includes('--all-quarters');
const quarterArg = (args.find((a) => a.startsWith('--quarter=')) || '').split('=')[1] || null;
const force = args.includes('--force');

async function loadHoldings(quarter) {
  return sql`
    SELECT
      eh.entity_id,
      eh.stock_id,
      eh.quarter::text AS quarter,
      s.nse_symbol,
      s.bse_code,
      eh.shares_held
    FROM entity_holdings eh
    JOIN stocks s ON s.id = eh.stock_id
    WHERE eh.strategy_id IS NULL
      AND eh.shares_held > 0
      ${quarter ? sql`AND eh.quarter = ${quarter}::date` : sql``}
      ${force ? sql`` : sql`AND (eh.market_value_cr IS NULL OR eh.market_value_cr = 0)`}
  `;
}

async function refreshQuarterStats(quarter) {
  await sql`
    UPDATE entity_quarterly_stats eqs
    SET portfolio_value_cr = COALESCE(sub.total, 0)
    FROM (
      SELECT entity_id, strategy_id, SUM(market_value_cr) AS total
      FROM entity_holdings
      WHERE strategy_id IS NULL AND quarter = ${quarter}::date
      GROUP BY entity_id, strategy_id
    ) sub
    WHERE eqs.entity_id = sub.entity_id
      AND eqs.strategy_id IS NULL
      AND sub.strategy_id IS NULL
      AND eqs.quarter = ${quarter}::date
  `;
}

async function main() {
  console.log('\n  💰 Computing entity holding values (Yahoo → NSE/BSE bhavcopy)…\n');
  requireDb();

  let quarters = [];
  if (allQuarters) {
    const rows = await sql`SELECT DISTINCT quarter::text AS q FROM entity_holdings WHERE strategy_id IS NULL ORDER BY q`;
    quarters = rows.map((r) => r.q);
  } else if (quarterArg) {
    quarters = [quarterArg];
  } else {
    quarters = [inferLatestQuarter()];
  }

  let updated = 0;
  let priced = 0;
  let skipped = 0;

  for (const quarter of quarters) {
    console.log(`  📅 ${quarter}`);
    const holdings = await loadHoldings(quarter);
    const uniqueStocks = [...new Map(holdings.map((t) => [t.stock_id, t])).values()];
    console.log(`    ${uniqueStocks.length} stocks to price · ${holdings.length} holding rows`);

    const priceByStock = new Map();
    await mapPool(uniqueStocks, 12, async (t) => {
      const close = await fetchQuarterEndClose(t.nse_symbol, quarter, t.bse_code);
      if (close != null) priced++;
      else skipped++;
      priceByStock.set(t.stock_id, close);
    });

    for (const h of holdings) {
      const close = priceByStock.get(h.stock_id);
      const valueCr = holdingValueCr(h.shares_held, close);
      if (valueCr == null) continue;
      await sql`
        UPDATE entity_holdings
        SET market_value_cr = ${valueCr}
        WHERE strategy_id IS NULL
          AND entity_id = ${h.entity_id}
          AND stock_id = ${h.stock_id}
          AND quarter = ${h.quarter}::date
      `;
      updated++;
    }

    await refreshQuarterStats(quarter);
    clearPriceCache();
    console.log(`    ✅ ${updated} holding rows valued for ${quarter}`);
  }

  console.log(`\n  Done — ${priced} prices fetched, ${skipped} misses, ${updated} rows updated\n`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
