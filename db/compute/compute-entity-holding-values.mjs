#!/usr/bin/env node
/**
 * Compute quarter-end stock prices and entity_holdings.market_value_cr.
 * Also upserts stock_quarter_prices for 1% Club holder values (incl. BSE-only stocks).
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

async function loadStocksToPrice(quarter) {
  return sql`
    SELECT DISTINCT
      s.id AS stock_id,
      COALESCE(
        NULLIF(TRIM(s.nse_symbol), ''),
        NULLIF(TRIM(sym.nse_symbol), '')
      ) AS nse_symbol,
      COALESCE(
        NULLIF(TRIM(s.bse_code), ''),
        NULLIF(TRIM(sym.bse_code), '')
      ) AS bse_code
    FROM (
      SELECT stock_id FROM entity_holdings
      WHERE strategy_id IS NULL AND quarter = ${quarter}::date
      UNION
      SELECT stock_id FROM shareholding_pattern_holders
      WHERE quarter = ${quarter}::date
        AND is_promoter = FALSE
        AND pct_of_company >= 1.0
    ) u
    JOIN stocks s ON s.id = u.stock_id
    LEFT JOIN LATERAL (
      SELECT s2.nse_symbol, s2.bse_code
      FROM stocks s2
      WHERE s.isin IS NOT NULL
        AND TRIM(s.isin) <> ''
        AND s2.isin = s.isin
        AND s2.id <> s.id
      ORDER BY
        (NULLIF(TRIM(s2.nse_symbol), '') IS NOT NULL) DESC,
        (NULLIF(TRIM(s2.bse_code), '') IS NOT NULL) DESC,
        s2.id ASC
      LIMIT 1
    ) sym ON TRUE
    WHERE COALESCE(
      NULLIF(TRIM(s.nse_symbol), ''),
      NULLIF(TRIM(s.bse_code), ''),
      NULLIF(TRIM(sym.nse_symbol), ''),
      NULLIF(TRIM(sym.bse_code), '')
    ) IS NOT NULL
  `;
}

async function loadHoldings(quarter) {
  return sql`
    SELECT
      eh.entity_id,
      eh.stock_id,
      eh.quarter::text AS quarter,
      eh.shares_held
    FROM entity_holdings eh
    WHERE eh.strategy_id IS NULL
      AND eh.shares_held > 0
      AND eh.quarter = ${quarter}::date
      ${force ? sql`` : sql`AND (eh.market_value_cr IS NULL OR eh.market_value_cr = 0)`}
  `;
}

async function upsertStockQuarterPrice(stockId, quarter, close) {
  if (close == null) return;
  await sql`
    INSERT INTO stock_quarter_prices (stock_id, quarter, close_price)
    VALUES (${stockId}, ${quarter}::date, ${close})
    ON CONFLICT (stock_id, quarter) DO UPDATE
    SET close_price = EXCLUDED.close_price, updated_at = NOW()
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

async function listQuarters() {
  if (allQuarters) {
    const rows = await sql`
      SELECT DISTINCT quarter::text AS q
      FROM (
        SELECT quarter FROM entity_holdings WHERE strategy_id IS NULL
        UNION
        SELECT quarter FROM shareholding_pattern_holders WHERE is_promoter = FALSE
      ) t
      ORDER BY q
    `;
    return rows.map((r) => r.q);
  }
  if (quarterArg) return [quarterArg];
  return [inferLatestQuarter()];
}

async function main() {
  console.log('\n  💰 Computing stock quarter prices + entity holding values…\n');
  requireDb();

  const quarters = await listQuarters();
  let pricesStored = 0;
  let priced = 0;
  let skipped = 0;
  let holdingsUpdated = 0;

  for (const quarter of quarters) {
    console.log(`  📅 ${quarter}`);
    const stocks = await loadStocksToPrice(quarter);
    console.log(`    ${stocks.length} stocks to price`);

    const priceByStock = new Map();
    await mapPool(stocks, 12, async (t) => {
      const close = await fetchQuarterEndClose(t.nse_symbol, quarter, t.bse_code);
      if (close != null) {
        priced++;
        await upsertStockQuarterPrice(t.stock_id, quarter, close);
        pricesStored++;
      } else {
        skipped++;
      }
      priceByStock.set(t.stock_id, close);
    });

    const holdings = await loadHoldings(quarter);
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
      holdingsUpdated++;
    }

    await refreshQuarterStats(quarter);
    clearPriceCache();
    console.log(`    ✅ ${pricesStored} quarter prices stored · ${holdingsUpdated} entity rows valued`);
  }

  console.log(`\n  Done — ${priced} prices fetched, ${skipped} misses, ${holdingsUpdated} entity rows updated\n`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
