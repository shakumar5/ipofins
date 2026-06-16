/**
 * Finverse — Compute Fund Overlap Scores
 * 
 * Calculates pairwise overlap between funds for Portfolio X-Ray feature.
 * Overlap = sum of min(weight_A, weight_B) for common stocks / 100
 * 
 * Run monthly after holdings data is loaded:
 *   node db/compute/compute-overlaps.mjs
 *   node db/compute/compute-overlaps.mjs --month=2026-05-01
 * 
 * Note: For N funds, this computes N*(N-1)/2 pairs.
 * With 200 funds = 19,900 pairs. Runs in ~30-60 seconds.
 */

import { sql, isDbConfigured } from '../../scripts/lib/db.mjs';

const args = process.argv.slice(2);
let targetMonth = null;

for (const arg of args) {
  if (arg.startsWith('--month=')) {
    targetMonth = arg.split('=')[1];
  }
}

async function computeOverlaps(month) {
  console.log(`\n  🔗 Computing fund overlaps for ${month}...`);

  // Get funds that have holdings for this month
  const fundsWithHoldings = await sql`
    SELECT DISTINCT fund_id FROM fund_holdings WHERE month = ${month}::DATE
  `;

  const fundIds = fundsWithHoldings.map(r => r.fund_id);
  console.log(`    Funds with holdings: ${fundIds.length}`);
  console.log(`    Pairs to compute: ${fundIds.length * (fundIds.length - 1) / 2}`);

  // Use SQL to compute all overlaps at once (much faster than row-by-row)
  await sql`
    INSERT INTO fund_overlaps (fund_a_id, fund_b_id, month, overlap_pct, common_stocks)
    SELECT
      a.fund_id AS fund_a_id,
      b.fund_id AS fund_b_id,
      ${month}::DATE AS month,
      SUM(LEAST(a.pct_to_nav, b.pct_to_nav)) AS overlap_pct,
      COUNT(*) AS common_stocks
    FROM fund_holdings a
    JOIN fund_holdings b 
      ON a.stock_id = b.stock_id 
      AND a.month = b.month
      AND a.fund_id < b.fund_id
    WHERE a.month = ${month}::DATE
    GROUP BY a.fund_id, b.fund_id
    HAVING COUNT(*) >= 2
    ON CONFLICT (fund_a_id, fund_b_id, month) DO UPDATE SET
      overlap_pct = EXCLUDED.overlap_pct,
      common_stocks = EXCLUDED.common_stocks
  `;

  const count = await sql`
    SELECT COUNT(*) as cnt FROM fund_overlaps WHERE month = ${month}::DATE
  `;
  console.log(`    ✅ ${count[0].cnt} overlap pairs computed`);
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Fund Overlap Computation');
  console.log('═══════════════════════════════════════════════════════════');

  if (!isDbConfigured()) {
    console.error('\n  ❌ DATABASE_URL not configured.');
    process.exit(1);
  }

  let month = targetMonth;
  if (!month) {
    const latestResult = await sql`SELECT MAX(month) as latest FROM fund_holdings`;
    if (!latestResult[0].latest) {
      console.error('\n  ❌ No holdings data found.');
      process.exit(1);
    }
    month = latestResult[0].latest;
  }

  console.log(`  📅 Target month: ${month}`);
  await computeOverlaps(month);

  console.log('\n  ✅ Overlap computation complete!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
