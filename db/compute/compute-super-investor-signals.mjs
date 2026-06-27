/**
 * Finverse — Compute Super Investor Signals
 *
 * Reads entity_holdings for the latest quarter, computes:
 *   1. entity_changes       — quarter-over-quarter fresh/exit/increased/decreased
 *   2. entity_stock_signals — aggregate: how many entities hold each stock
 *   3. entity_quarterly_stats — portfolio-level metrics per entity (+ strategy)
 *   4. entity_overlaps       — pairwise common holdings between entities
 *   5. entity_conviction      — per-position conviction score 0–100
 *   6. Refresh materialized views (mv_super_investor_latest, etc.)
 *
 * Mirrors the existing compute-signals.mjs pattern (SQL FULL OUTER JOIN for
 * changes, then aggregation, then percentile normalization).
 *
 * Run after pipeline:superinvestor (and optionally pipeline:pms, pipeline:altfunds):
 *   node scripts/node-with-ca.mjs db/compute/compute-super-investor-signals.mjs
 *   node scripts/node-with-ca.mjs db/compute/compute-super-investor-signals.mjs --all-quarters
 *
 * Usage:
 *   npm run db:compute-si
 */

import { sql, isDbConfigured } from '../../scripts/lib/db.mjs';
import { stockListingKeySql } from '../../scripts/lib/stock-listing-key.mjs';

// ═══════════════════════════════════════════════════════════════
// PARSE ARGS
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
let targetQuarter = null;
const allQuarters = args.includes('--all-quarters');

for (const arg of args) {
  if (arg.startsWith('--quarter=')) {
    targetQuarter = arg.split('=')[1];
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: COMPUTE ENTITY CHANGES (mirrors holdings_changes)
// ═══════════════════════════════════════════════════════════════

async function computeEntityChanges(quarter) {
  console.log(`\n  🔄 Computing entity changes for ${quarter}...`);

  // Idempotent re-run: clear prior rows (NULL strategy_id breaks UNIQUE dedupe in PG).
  await sql`DELETE FROM entity_changes WHERE quarter = ${quarter}::DATE`;

  // Find the previous quarter in entity_holdings.
  const prevResult = await sql`
    SELECT DISTINCT quarter FROM entity_holdings
    WHERE quarter < ${quarter}::DATE
    ORDER BY quarter DESC LIMIT 1
  `;

  if (prevResult.length === 0) {
    console.log('    ⚠️  No previous quarter data. Marking all as fresh_entry.');

    await sql`
      INSERT INTO entity_changes (entity_id, strategy_id, stock_id, quarter, prev_quarter, change_type, prev_shares, new_shares, qty_change, pct_change, value_change_cr)
      SELECT
        entity_id, strategy_id, stock_id, quarter, NULL,
        'fresh_entry',
        0, shares_held, shares_held,
        pct_of_company, 0
      FROM (
        SELECT DISTINCT ON (eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug))
          eh.entity_id, eh.strategy_id, eh.stock_id, eh.quarter, eh.shares_held, eh.pct_of_company
        FROM entity_holdings eh
        JOIN stocks s ON s.id = eh.stock_id
        WHERE eh.quarter = ${quarter}::DATE
        ORDER BY eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug),
          eh.pct_of_company DESC NULLS LAST, eh.stock_id DESC
      ) eh
      ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
        prev_quarter   = EXCLUDED.prev_quarter,
        change_type    = EXCLUDED.change_type,
        prev_shares    = EXCLUDED.prev_shares,
        new_shares     = EXCLUDED.new_shares,
        qty_change     = EXCLUDED.qty_change,
        pct_change     = EXCLUDED.pct_change,
        value_change_cr = EXCLUDED.value_change_cr
    `;
    return;
  }

  const prevQuarter = prevResult[0].quarter;
  console.log(`    Previous quarter: ${prevQuarter}`);

  // FULL OUTER JOIN — dedupe holdings first (pipeline may have residual duplicate rows).
  await sql`
    INSERT INTO entity_changes (entity_id, strategy_id, stock_id, quarter, prev_quarter, change_type, prev_shares, new_shares, qty_change, pct_change, value_change_cr)
    SELECT
      COALESCE(curr.entity_id, prev.entity_id),
      COALESCE(curr.strategy_id, prev.strategy_id),
      COALESCE(curr.stock_id, prev.stock_id),
      ${quarter}::DATE,
      ${prevQuarter}::DATE,
      CASE
        WHEN prev.stock_id IS NULL THEN 'fresh_entry'
        WHEN curr.stock_id IS NULL THEN 'complete_exit'
        WHEN (COALESCE(curr.pct_of_company, 0) - COALESCE(prev.pct_of_company, 0)) > 0.01 THEN 'increased'
        WHEN (COALESCE(prev.pct_of_company, 0) - COALESCE(curr.pct_of_company, 0)) > 0.01 THEN 'decreased'
        ELSE 'unchanged'
      END,
      COALESCE(prev.shares_held, 0),
      COALESCE(curr.shares_held, 0),
      COALESCE(curr.shares_held, 0) - COALESCE(prev.shares_held, 0),
      COALESCE(curr.pct_of_company, 0) - COALESCE(prev.pct_of_company, 0),
      COALESCE(curr.market_value_cr, 0) - COALESCE(prev.market_value_cr, 0)
    FROM (
      SELECT DISTINCT ON (eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug))
        eh.entity_id, eh.strategy_id, eh.stock_id,
        COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug) AS stock_key,
        eh.shares_held, eh.pct_of_company, eh.market_value_cr
      FROM entity_holdings eh
      JOIN stocks s ON s.id = eh.stock_id
      WHERE eh.quarter = ${quarter}::DATE
      ORDER BY eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug),
        eh.pct_of_company DESC NULLS LAST, eh.stock_id DESC
    ) curr
    FULL OUTER JOIN (
      SELECT DISTINCT ON (eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug))
        eh.entity_id, eh.strategy_id, eh.stock_id,
        COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug) AS stock_key,
        eh.shares_held, eh.pct_of_company, eh.market_value_cr
      FROM entity_holdings eh
      JOIN stocks s ON s.id = eh.stock_id
      WHERE eh.quarter = ${prevQuarter}::DATE
      ORDER BY eh.entity_id, eh.strategy_id, COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug),
        eh.pct_of_company DESC NULLS LAST, eh.stock_id DESC
    ) prev
      ON curr.entity_id    = prev.entity_id
     AND curr.strategy_id IS NOT DISTINCT FROM prev.strategy_id
     AND curr.stock_key    = prev.stock_key
    ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
      prev_quarter   = EXCLUDED.prev_quarter,
      change_type    = EXCLUDED.change_type,
      prev_shares    = EXCLUDED.prev_shares,
      new_shares     = EXCLUDED.new_shares,
      qty_change     = EXCLUDED.qty_change,
      pct_change     = EXCLUDED.pct_change,
      value_change_cr = EXCLUDED.value_change_cr
  `;

  // Count results.
  const counts = await sql`
    SELECT change_type, COUNT(*) AS cnt
    FROM entity_changes WHERE quarter = ${quarter}::DATE
    GROUP BY change_type ORDER BY change_type
  `;
  for (const row of counts) {
    console.log(`    ${row.change_type}: ${row.cnt}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 2: COMPUTE ENTITY STOCK SIGNALS (mirrors stock_signals)
// ═══════════════════════════════════════════════════════════════

async function computeEntityStockSignals(quarter) {
  console.log(`\n  📊 Computing entity stock signals for ${quarter}...`);

  await sql`
    INSERT INTO entity_stock_signals (stock_id, quarter, investors_holding, fresh_entries, complete_exits, increased_count, decreased_count, net_value_change, total_value_held, conviction_score)
    SELECT
      ec.stock_id,
      ${quarter}::DATE AS quarter,
      COUNT(DISTINCT CASE WHEN ec.change_type != 'complete_exit' THEN ec.entity_id END) AS investors_holding,
      COUNT(CASE WHEN ec.change_type = 'fresh_entry' THEN 1 END) AS fresh_entries,
      COUNT(CASE WHEN ec.change_type = 'complete_exit' THEN 1 END) AS complete_exits,
      COUNT(CASE WHEN ec.change_type = 'increased' THEN 1 END) AS increased_count,
      COUNT(CASE WHEN ec.change_type = 'decreased' THEN 1 END) AS decreased_count,
      SUM(ec.value_change_cr) AS net_value_change,
      COALESCE((
        SELECT SUM(eh.market_value_cr)
        FROM entity_holdings eh
        WHERE eh.stock_id = ec.stock_id AND eh.quarter = ${quarter}::DATE
      ), 0) AS total_value_held,
      -- Raw conviction (before normalization):
      -- positive actions add, negative subtract, divided by entity count.
      (
        COUNT(CASE WHEN ec.change_type = 'fresh_entry' THEN 1 END) * 3.0 +
        COUNT(CASE WHEN ec.change_type = 'increased' THEN 1 END) * 2.0 -
        COUNT(CASE WHEN ec.change_type = 'complete_exit' THEN 1 END) * 3.0 -
        COUNT(CASE WHEN ec.change_type = 'decreased' THEN 1 END) * 1.0
      ) / GREATEST(
        COUNT(DISTINCT CASE WHEN ec.change_type != 'complete_exit' THEN ec.entity_id END), 1
      ) * 10 AS conviction_score
    FROM entity_changes ec
    WHERE ec.quarter = ${quarter}::DATE
    GROUP BY ec.stock_id
    ON CONFLICT (stock_id, quarter) DO UPDATE SET
      investors_holding = EXCLUDED.investors_holding,
      fresh_entries     = EXCLUDED.fresh_entries,
      complete_exits    = EXCLUDED.complete_exits,
      increased_count   = EXCLUDED.increased_count,
      decreased_count   = EXCLUDED.decreased_count,
      net_value_change  = EXCLUDED.net_value_change,
      total_value_held  = EXCLUDED.total_value_held,
      conviction_score   = EXCLUDED.conviction_score
  `;

  // Normalize conviction scores to 0–100 (percentile rank).
  console.log('    Normalizing scores to 0–100...');
  await sql`
    UPDATE entity_stock_signals SET conviction_score = sub.normalized_score
    FROM (
      SELECT
        stock_id, quarter,
        ROUND((PERCENT_RANK() OVER (ORDER BY conviction_score ASC) * 100)::NUMERIC, 2)
        AS normalized_score
      FROM entity_stock_signals WHERE quarter = ${quarter}::DATE
    ) sub
    WHERE entity_stock_signals.stock_id = sub.stock_id
      AND entity_stock_signals.quarter = sub.quarter
  `;

  const signalCount = await sql`
    SELECT COUNT(*) AS cnt FROM entity_stock_signals WHERE quarter = ${quarter}::DATE
  `;
  console.log(`    ✅ ${signalCount[0].cnt} stock signal rows computed`);
}

// ═══════════════════════════════════════════════════════════════
// STEP 3: COMPUTE ENTITY QUARTERLY STATS (mirrors amc_monthly_stats)
// ═══════════════════════════════════════════════════════════════

async function computeEntityQuarterlyStats(quarter) {
  console.log(`\n  📈 Computing entity quarterly stats for ${quarter}...`);

  await sql`
    INSERT INTO entity_quarterly_stats (entity_id, strategy_id, quarter, total_holdings, portfolio_value_cr, top5_concentration, hhi, turnover_ratio, large_cap_pct, mid_cap_pct, small_cap_pct)
    WITH deduped AS (
      SELECT
        eh.entity_id,
        eh.strategy_id,
        eh.quarter,
        MAX(eh.shares_held) AS shares_held,
        MAX(eh.pct_of_company) AS pct_of_company,
        MAX(eh.market_value_cr) AS market_value_cr
      FROM entity_holdings eh
      JOIN stocks s ON s.id = eh.stock_id
      WHERE eh.quarter = ${quarter}::DATE
      GROUP BY eh.entity_id, eh.strategy_id, eh.quarter, ${sql.unsafe(stockListingKeySql('s'))}
    )
    SELECT
      eh.entity_id,
      eh.strategy_id,
      ${quarter}::DATE,
      COUNT(*) AS total_holdings,
      COALESCE(SUM(eh.market_value_cr), 0) AS portfolio_value_cr,
      -- Top-5 concentration: sum of top 5 holdings as % of total.
      CASE WHEN COUNT(*) > 0 THEN
        ROUND((
          SELECT SUM(pct_of_company)
          FROM (
            SELECT pct_of_company
            FROM deduped h2
            WHERE h2.entity_id = eh.entity_id
              AND h2.strategy_id IS NOT DISTINCT FROM eh.strategy_id
            ORDER BY pct_of_company DESC
            LIMIT 5
          ) t
        ) / NULLIF(SUM(eh.pct_of_company), 0) * 100, 2)
      ELSE 0 END AS top5_concentration,
      -- HHI (Herfindahl index): sum of squared pct shares.
      ROUND(
        SUM(POWER(COALESCE(eh.pct_of_company, 0), 2)) / NULLIF(POWER(SUM(COALESCE(eh.pct_of_company, 0)), 2), 0) * 10000,
        3
      ) AS hhi,
      -- Turnover ratio: (increases + exits) / total holdings (from entity_changes).
      COALESCE(
        (SELECT
          COUNT(CASE WHEN ec.change_type IN ('fresh_entry', 'complete_exit', 'increased', 'decreased') THEN 1 END)::NUMERIC
          / NULLIF(COUNT(*), 0)
        FROM entity_changes ec
        WHERE ec.entity_id = eh.entity_id AND ec.strategy_id IS NOT DISTINCT FROM eh.strategy_id
          AND ec.quarter = ${quarter}::DATE
        ), 0
      ) AS turnover_ratio,
      -- Market cap splits (join to stocks table).
      COALESCE(
        ROUND((SELECT COUNT(*)::NUMERIC / NULLIF(COUNT(*), 0) * 100
          FROM deduped h3
          JOIN stocks s3 ON s3.id = h3.stock_id
          WHERE h3.entity_id = eh.entity_id AND h3.strategy_id IS NOT DISTINCT FROM eh.strategy_id
            AND s3.market_cap_category = 'large'
        ), 2), 0) AS large_cap_pct,
      COALESCE(
        ROUND((SELECT COUNT(*)::NUMERIC / NULLIF(COUNT(*), 0) * 100
          FROM deduped h4
          JOIN stocks s4 ON s4.id = h4.stock_id
          WHERE h4.entity_id = eh.entity_id AND h4.strategy_id IS NOT DISTINCT FROM eh.strategy_id
            AND s4.market_cap_category = 'mid'
        ), 2), 0) AS mid_cap_pct,
      COALESCE(
        ROUND((SELECT COUNT(*)::NUMERIC / NULLIF(COUNT(*), 0) * 100
          FROM deduped h5
          JOIN stocks s5 ON s5.id = h5.stock_id
          WHERE h5.entity_id = eh.entity_id AND h5.strategy_id IS NOT DISTINCT FROM eh.strategy_id
            AND s5.market_cap_category = 'small'
        ), 2), 0) AS small_cap_pct
    FROM deduped eh
    GROUP BY eh.entity_id, eh.strategy_id
    ON CONFLICT (entity_id, strategy_id, quarter) DO UPDATE SET
      total_holdings     = EXCLUDED.total_holdings,
      portfolio_value_cr = EXCLUDED.portfolio_value_cr,
      top5_concentration = EXCLUDED.top5_concentration,
      hhi                = EXCLUDED.hhi,
      turnover_ratio     = EXCLUDED.turnover_ratio,
      large_cap_pct      = EXCLUDED.large_cap_pct,
      mid_cap_pct        = EXCLUDED.mid_cap_pct,
      small_cap_pct      = EXCLUDED.small_cap_pct
  `;

  const statsCount = await sql`
    SELECT COUNT(*) AS cnt FROM entity_quarterly_stats WHERE quarter = ${quarter}::DATE
  `;
  console.log(`    ✅ ${statsCount[0].cnt} entity quarterly stat rows`);
}

// ═══════════════════════════════════════════════════════════════
// STEP 4: COMPUTE ENTITY OVERLAPS (mirrors fund_overlaps)
// ═══════════════════════════════════════════════════════════════

async function computeEntityOverlaps(quarter) {
  console.log(`\n  🔄 Computing entity overlaps for ${quarter}...`);

  // Pairwise overlap: for each pair of entities holding at least 1 common stock
  // this quarter, compute overlap % = common_stocks / min(a_holdings, b_holdings).
  await sql`
    INSERT INTO entity_overlaps (entity_a_id, entity_b_id, quarter, overlap_pct, common_stocks)
    SELECT
      a.entity_id AS entity_a_id,
      b.entity_id AS entity_b_id,
      ${quarter}::DATE,
      ROUND(
        COUNT(*)::NUMERIC / LEAST(
          (SELECT COUNT(*) FROM entity_holdings WHERE entity_id = a.entity_id AND quarter = ${quarter}::DATE),
          (SELECT COUNT(*) FROM entity_holdings WHERE entity_id = b.entity_id AND quarter = ${quarter}::DATE)
        ) * 100, 2
      ) AS overlap_pct,
      COUNT(*) AS common_stocks
    FROM entity_holdings a
    JOIN entity_holdings b
      ON a.stock_id = b.stock_id
     AND a.quarter = ${quarter}::DATE
     AND b.quarter = ${quarter}::DATE
     AND a.entity_id < b.entity_id
    GROUP BY a.entity_id, b.entity_id
    HAVING COUNT(*) >= 1
    ON CONFLICT (entity_a_id, entity_b_id, quarter) DO UPDATE SET
      overlap_pct  = EXCLUDED.overlap_pct,
      common_stocks = EXCLUDED.common_stocks
  `;

  const overlapCount = await sql`
    SELECT COUNT(*) AS cnt FROM entity_overlaps WHERE quarter = ${quarter}::DATE
  `;
  console.log(`    ✅ ${overlapCount[0].cnt} entity pair overlaps`);
}

// ═══════════════════════════════════════════════════════════════
// STEP 5: COMPUTE PER-POSITION CONVICTION
// ═══════════════════════════════════════════════════════════════

async function computeEntityConviction(quarter) {
  console.log(`\n  🎯 Computing per-position conviction for ${quarter}...`);

  // Conviction model (mirrors conviction-score-v2 logic):
  //   score = w1·position_size + w2·duration + w3·recent_add - w4·recent_trim
  // Weights: position_size=35, duration=25, recent_add=25, recent_trim=-15
  await sql`
    INSERT INTO entity_conviction (entity_id, strategy_id, stock_id, quarter, conviction, holding_quarters, trend)
    SELECT DISTINCT ON (eh.entity_id, eh.strategy_id, eh.stock_id)
      eh.entity_id,
      eh.strategy_id,
      eh.stock_id,
      ${quarter}::DATE,
      -- Clamp to 0–100.
      LEAST(100, GREATEST(0, ROUND(
        -- w1: Position size (pct of company → 0–35)
        LEAST(eh.pct_of_company, 10) / 10 * 35
        +
        -- w2: Holding duration (quarters → 0–25)
        LEAST(COALESCE(hold_dur.cnt, 0), 8) / 8 * 25
        +
        -- w3: Recent add bonus (change_type → 0–25)
        CASE
          WHEN ec.change_type = 'fresh_entry' THEN 25
          WHEN ec.change_type = 'increased' THEN 15
          ELSE 0
        END
        +
        -- w4: Recent trim penalty (-15)
        CASE
          WHEN ec.change_type = 'decreased' THEN -10
          WHEN ec.change_type = 'complete_exit' THEN -15
          ELSE 0
        END
      , 2))) AS conviction,
      COALESCE(hold_dur.cnt, 1) AS holding_quarters,
      CASE
        WHEN ec.change_type = 'increased'  OR ec.change_type = 'fresh_entry' THEN 'rising'
        WHEN ec.change_type = 'decreased'  OR ec.change_type = 'complete_exit' THEN 'falling'
        ELSE 'stable'
      END AS trend
    FROM entity_holdings eh
    LEFT JOIN (
      SELECT DISTINCT ON (entity_id, strategy_id, stock_id, quarter)
        entity_id, strategy_id, stock_id, quarter, change_type
      FROM entity_changes
      WHERE quarter = ${quarter}::DATE
      ORDER BY entity_id, strategy_id, stock_id, quarter, change_type
    ) ec
      ON ec.entity_id = eh.entity_id
     AND ec.strategy_id IS NOT DISTINCT FROM eh.strategy_id
     AND ec.stock_id = eh.stock_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS cnt
      FROM entity_holdings h2
      WHERE h2.entity_id = eh.entity_id
        AND h2.strategy_id = eh.strategy_id
        AND h2.stock_id = eh.stock_id
        AND h2.quarter <= ${quarter}::DATE
    ) hold_dur ON true
    WHERE eh.quarter = ${quarter}::DATE
    ORDER BY eh.entity_id, eh.strategy_id, eh.stock_id, eh.pct_of_company DESC NULLS LAST
    ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
      conviction      = EXCLUDED.conviction,
      holding_quarters = EXCLUDED.holding_quarters,
      trend           = EXCLUDED.trend
  `;

  const convCount = await sql`
    SELECT COUNT(*) AS cnt FROM entity_conviction WHERE quarter = ${quarter}::DATE
  `;
  console.log(`    ✅ ${convCount[0].cnt} conviction rows`);
}

// ═══════════════════════════════════════════════════════════════
// STEP 6: REFRESH MATERIALIZED VIEWS
// ═══════════════════════════════════════════════════════════════

async function refreshViews() {
  console.log('\n  🔄 Refreshing super-investor materialized views...');
  try {
    await sql`SELECT refresh_super_investor_views()`;
    console.log('    ✅ All views refreshed');
  } catch (err) {
    console.log(`    ⚠️  View refresh failed (migration 006 may not be applied): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function computeForQuarter(quarter) {
  console.log(`\n  📅 Target quarter: ${quarter}`);
  await computeEntityChanges(quarter);
  await computeEntityStockSignals(quarter);
  await computeEntityQuarterlyStats(quarter);
  await computeEntityOverlaps(quarter);
  await computeEntityConviction(quarter);
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Super Investor Signal Computation');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isDbConfigured()) {
    console.error('\n  ❌ DATABASE_URL not configured.');
    process.exit(1);
  }

  if (allQuarters) {
    const quarterRows = await sql`
      SELECT DISTINCT quarter::text AS q FROM entity_holdings ORDER BY q ASC
    `;
    if (!quarterRows.length) {
      console.error('\n  ❌ No entity_holdings data found. Run pipeline:superinvestor first.');
      process.exit(1);
    }
    console.log(`  📚 Computing ${quarterRows.length} quarter(s) in chronological order`);
    for (const { q } of quarterRows) {
      await computeForQuarter(q);
    }
    await refreshViews();
    console.log('\n───────────────────────────────────────────────────────────');
    console.log('  ✅ Super investor signal computation complete (all quarters)!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    return;
  }

  let quarter = targetQuarter;
  if (!quarter) {
    const latestResult = await sql`
      SELECT quarter::text AS latest FROM entity_holdings ORDER BY quarter DESC LIMIT 1
    `;
    if (!latestResult[0]?.latest) {
      console.error('\n  ❌ No entity_holdings data found. Run pipeline:superinvestor first.');
      process.exit(1);
    }
    quarter = latestResult[0].latest;
  }

  await computeForQuarter(quarter);
  await refreshViews();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Super investor signal computation complete!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('❌ Computation failed:', err.message);
  process.exit(1);
});
