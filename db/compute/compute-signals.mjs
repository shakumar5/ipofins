/**
 * Finverse — Compute Smart Money Signals
 * 
 * Reads fund_holdings for the last 2 months, computes:
 *   1. holdings_changes (per fund: fresh entry, exit, increased, decreased)
 *   2. stock_signals (aggregate: how many funds bought/sold, by category)
 *   3. sector_allocations (sector rotation data)
 * 
 * Run monthly after new holdings data is loaded:
 *   node db/compute/compute-signals.mjs
 *   node db/compute/compute-signals.mjs --month=2026-05-01
 * 
 * This is the core "smart money engine" — produces all derived analytics.
 */

import { sql, isDbConfigured, dbQuery } from '../../scripts/lib/db.mjs';

// ═══════════════════════════════════════════════════════════════
// PARSE ARGS
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2);
let targetMonth = null;

for (const arg of args) {
  if (arg.startsWith('--month=')) {
    targetMonth = arg.split('=')[1];
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 1: COMPUTE HOLDINGS CHANGES
// ═══════════════════════════════════════════════════════════════

async function computeHoldingsChanges(month) {
  console.log(`\n  🔄 Computing holdings changes for ${month}...`);

  // Get previous month
  const prevMonthResult = await sql`
    SELECT DISTINCT month FROM fund_holdings 
    WHERE month < ${month}::DATE 
    ORDER BY month DESC LIMIT 1
  `;
  
  if (prevMonthResult.length === 0) {
    console.log('    ⚠️  No previous month data found. Marking all as fresh_entry.');
    
    // All holdings in this month are fresh entries
    await sql`
      INSERT INTO holdings_changes (fund_id, stock_id, month, prev_month, change_type, qty_change, pct_change, prev_pct, new_pct, prev_quantity, new_quantity)
      SELECT 
        fund_id, stock_id, month, NULL,
        'fresh_entry',
        quantity,
        pct_to_nav,
        0,
        pct_to_nav,
        0,
        quantity
      FROM fund_holdings
      WHERE month = ${month}::DATE
      ON CONFLICT (fund_id, stock_id, month) DO NOTHING
    `;
    return;
  }

  const prevMonth = prevMonthResult[0].month;
  console.log(`    Previous month: ${prevMonth}`);

  // Compute changes using a FULL OUTER JOIN between current and previous month
  await sql`
    INSERT INTO holdings_changes (fund_id, stock_id, month, prev_month, change_type, qty_change, pct_change, prev_pct, new_pct, prev_quantity, new_quantity)
    SELECT
      COALESCE(curr.fund_id, prev.fund_id),
      COALESCE(curr.stock_id, prev.stock_id),
      ${month}::DATE,
      ${prevMonth}::DATE,
      CASE
        WHEN prev.stock_id IS NULL THEN 'fresh_entry'
        WHEN curr.stock_id IS NULL THEN 'complete_exit'
        WHEN curr.quantity > prev.quantity THEN 'increased'
        WHEN curr.quantity < prev.quantity THEN 'decreased'
        ELSE 'unchanged'
      END,
      COALESCE(curr.quantity, 0) - COALESCE(prev.quantity, 0),
      COALESCE(curr.pct_to_nav, 0) - COALESCE(prev.pct_to_nav, 0),
      COALESCE(prev.pct_to_nav, 0),
      COALESCE(curr.pct_to_nav, 0),
      COALESCE(prev.quantity, 0),
      COALESCE(curr.quantity, 0)
    FROM fund_holdings curr
    FULL OUTER JOIN fund_holdings prev 
      ON curr.fund_id = prev.fund_id 
      AND curr.stock_id = prev.stock_id 
      AND curr.month = ${month}::DATE
      AND prev.month = ${prevMonth}::DATE
    WHERE curr.month = ${month}::DATE
      OR (prev.month = ${prevMonth}::DATE AND curr.stock_id IS NULL)
    ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
      change_type = EXCLUDED.change_type,
      qty_change = EXCLUDED.qty_change,
      pct_change = EXCLUDED.pct_change,
      prev_pct = EXCLUDED.prev_pct,
      new_pct = EXCLUDED.new_pct,
      prev_quantity = EXCLUDED.prev_quantity,
      new_quantity = EXCLUDED.new_quantity
  `;

  // Count results
  const counts = await sql`
    SELECT change_type, COUNT(*) as cnt 
    FROM holdings_changes 
    WHERE month = ${month}::DATE
    GROUP BY change_type
    ORDER BY change_type
  `;
  
  for (const row of counts) {
    console.log(`    ${row.change_type}: ${row.cnt}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 2: COMPUTE STOCK SIGNALS (per category + ALL)
// ═══════════════════════════════════════════════════════════════

async function computeStockSignals(month) {
  console.log(`\n  📊 Computing stock signals for ${month}...`);

  // Get all categories
  const categories = await sql`
    SELECT DISTINCT f.category 
    FROM holdings_changes hc
    JOIN funds f ON f.id = hc.fund_id
    WHERE hc.month = ${month}::DATE
    ORDER BY f.category
  `;

  const categoryList = [...categories.map(r => r.category), 'ALL'];
  console.log(`    Categories: ${categoryList.join(', ')}`);

  for (const category of categoryList) {
    const categoryFilter = category === 'ALL' ? '' : category;

    // Compute aggregated signals per stock
    const query = `
      INSERT INTO stock_signals (stock_id, month, category, total_funds_holding, fresh_entries, complete_exits, increased_count, decreased_count, net_quantity_change, total_value_held, avg_pct_allocation, conviction_score)
      SELECT
        hc.stock_id,
        $1::DATE AS month,
        $2 AS category,
        COUNT(DISTINCT CASE WHEN hc.change_type != 'complete_exit' THEN hc.fund_id END) AS total_funds_holding,
        COUNT(CASE WHEN hc.change_type = 'fresh_entry' THEN 1 END) AS fresh_entries,
        COUNT(CASE WHEN hc.change_type = 'complete_exit' THEN 1 END) AS complete_exits,
        COUNT(CASE WHEN hc.change_type = 'increased' THEN 1 END) AS increased_count,
        COUNT(CASE WHEN hc.change_type = 'decreased' THEN 1 END) AS decreased_count,
        SUM(hc.qty_change) AS net_quantity_change,
        COALESCE((SELECT SUM(fh.market_value) FROM fund_holdings fh 
          JOIN funds f2 ON f2.id = fh.fund_id
          WHERE fh.stock_id = hc.stock_id AND fh.month = $1::DATE
          ${categoryFilter ? `AND f2.category = '${categoryFilter}'` : ''}
        ), 0) AS total_value_held,
        COALESCE((SELECT AVG(fh.pct_to_nav) FROM fund_holdings fh
          JOIN funds f2 ON f2.id = fh.fund_id
          WHERE fh.stock_id = hc.stock_id AND fh.month = $1::DATE
          ${categoryFilter ? `AND f2.category = '${categoryFilter}'` : ''}
        ), 0) AS avg_pct_allocation,
        -- Conviction score formula
        (
          COUNT(CASE WHEN hc.change_type = 'fresh_entry' THEN 1 END) * 3.0 +
          COUNT(CASE WHEN hc.change_type = 'increased' THEN 1 END) * 2.0 -
          COUNT(CASE WHEN hc.change_type = 'complete_exit' THEN 1 END) * 3.0 -
          COUNT(CASE WHEN hc.change_type = 'decreased' THEN 1 END) * 1.0
        ) / GREATEST(COUNT(DISTINCT CASE WHEN hc.change_type != 'complete_exit' THEN hc.fund_id END), 1) * 10
        AS conviction_score
      FROM holdings_changes hc
      JOIN funds f ON f.id = hc.fund_id
      WHERE hc.month = $1::DATE
        ${categoryFilter ? `AND f.category = '${categoryFilter}'` : ''}
      GROUP BY hc.stock_id
      ON CONFLICT (stock_id, month, category) DO UPDATE SET
        total_funds_holding = EXCLUDED.total_funds_holding,
        fresh_entries = EXCLUDED.fresh_entries,
        complete_exits = EXCLUDED.complete_exits,
        increased_count = EXCLUDED.increased_count,
        decreased_count = EXCLUDED.decreased_count,
        net_quantity_change = EXCLUDED.net_quantity_change,
        total_value_held = EXCLUDED.total_value_held,
        avg_pct_allocation = EXCLUDED.avg_pct_allocation,
        conviction_score = EXCLUDED.conviction_score
    `;

    await dbQuery(query, [month, category]);
  }

  const signalCount = await sql`
    SELECT COUNT(*) as cnt FROM stock_signals WHERE month = ${month}::DATE
  `;
  console.log(`    ✅ ${signalCount[0].cnt} stock signal rows computed`);

  // Normalize conviction scores to 0-100 scale (percentile rank within each category)
  console.log('    Normalizing scores to 0-100...');
  await sql`
    UPDATE stock_signals SET conviction_score = sub.normalized_score
    FROM (
      SELECT 
        stock_id, month, category,
        ROUND(
          (PERCENT_RANK() OVER (PARTITION BY month, category ORDER BY conviction_score ASC) * 100)::NUMERIC
        , 2) AS normalized_score
      FROM stock_signals
      WHERE month = ${month}::DATE
    ) sub
    WHERE stock_signals.stock_id = sub.stock_id
      AND stock_signals.month = sub.month
      AND stock_signals.category = sub.category
  `;
  console.log('    ✅ Scores normalized (0 = most sold, 100 = most bought)');
}

// ═══════════════════════════════════════════════════════════════
// STEP 3: COMPUTE SECTOR ALLOCATIONS
// ═══════════════════════════════════════════════════════════════

async function computeSectorAllocations(month) {
  console.log(`\n  🌐 Computing sector allocations for ${month}...`);

  // Get previous month for mom_change calculation
  const prevMonthResult = await sql`
    SELECT DISTINCT month FROM sector_allocations 
    WHERE month < ${month}::DATE 
    ORDER BY month DESC LIMIT 1
  `;
  const prevMonth = prevMonthResult.length > 0 ? prevMonthResult[0].month : null;

  await sql`
    INSERT INTO sector_allocations (sector_id, month, category, total_value, pct_of_total_equity, fund_count, avg_allocation_pct, mom_change)
    SELECT
      s.sector_id,
      ${month}::DATE,
      'ALL',
      SUM(fh.market_value),
      SUM(fh.market_value) * 100.0 / NULLIF((SELECT SUM(market_value) FROM fund_holdings WHERE month = ${month}::DATE), 0),
      COUNT(DISTINCT fh.fund_id),
      AVG(fh.pct_to_nav),
      0  -- Will update mom_change below
    FROM fund_holdings fh
    JOIN stocks s ON s.id = fh.stock_id
    WHERE fh.month = ${month}::DATE
      AND s.sector_id IS NOT NULL
    GROUP BY s.sector_id
    ON CONFLICT (sector_id, month, category) DO UPDATE SET
      total_value = EXCLUDED.total_value,
      pct_of_total_equity = EXCLUDED.pct_of_total_equity,
      fund_count = EXCLUDED.fund_count,
      avg_allocation_pct = EXCLUDED.avg_allocation_pct
  `;

  // Update mom_change if we have previous data
  if (prevMonth) {
    await sql`
      UPDATE sector_allocations sa SET
        mom_change = sa.pct_of_total_equity - COALESCE(prev.pct_of_total_equity, 0)
      FROM sector_allocations prev
      WHERE prev.sector_id = sa.sector_id
        AND prev.month = ${prevMonth}::DATE
        AND prev.category = sa.category
        AND sa.month = ${month}::DATE
    `;
  }

  const count = await sql`
    SELECT COUNT(*) as cnt FROM sector_allocations WHERE month = ${month}::DATE
  `;
  console.log(`    ✅ ${count[0].cnt} sector allocation rows`);
}

// ═══════════════════════════════════════════════════════════════
// STEP 4: REFRESH MATERIALIZED VIEWS
// ═══════════════════════════════════════════════════════════════

async function refreshViews() {
  console.log('\n  🔄 Refreshing materialized views...');
  try {
    await sql`SELECT refresh_all_views()`;
    console.log('    ✅ All views refreshed');
  } catch (err) {
    console.log(`    ⚠️  View refresh failed (might not exist yet): ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Smart Money Signal Computation');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isDbConfigured()) {
    console.error('\n  ❌ DATABASE_URL not configured.');
    process.exit(1);
  }

  // Determine target month
  let month = targetMonth;
  if (!month) {
    const latestResult = await sql`SELECT month::text AS latest FROM fund_holdings ORDER BY month DESC LIMIT 1`;
    if (!latestResult[0]?.latest) {
      console.error('\n  ❌ No holdings data found in database. Run seed first.');
      process.exit(1);
    }
    month = latestResult[0].latest;
  }

  console.log(`  📅 Target month: ${month}`);

  await computeHoldingsChanges(month);
  await computeStockSignals(month);
  await computeSectorAllocations(month);
  await refreshViews();

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('  ✅ Signal computation complete!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(err => {
  console.error('❌ Computation failed:', err.message);
  process.exit(1);
});
