/**
 * Finverse — Fast Holdings Seeder
 *
 * Uses direct Postgres UNNEST bulk inserts (10–50× faster than HTTP batches).
 *
 * Usage:
 *   node db/seed/seed-holdings-batch.mjs              # incremental: latest month only
 *   node db/seed/seed-holdings-batch.mjs --full       # wipe & reload all months
 *   node db/seed/seed-holdings-batch.mjs --month=2026-06-01
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildFundMatcher, slugify } from '../../scripts/lib/fund-match.mjs';
import { bulkUpsertFundHoldings, closePgPool } from '../../scripts/lib/pg-bulk.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DATA_DIR = join(ROOT, 'src', 'data');

const args = process.argv.slice(2);
const fullReload = args.includes('--full');
const monthArg = args.find((a) => a.startsWith('--month='))?.split('=')[1];

const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = envContent.match(/DATABASE_URL=(.+)/)[1].trim();
process.env.DATABASE_URL = dbUrl;
const sql = neon(dbUrl);

function readJSON(file) {
  const p = join(DATA_DIR, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
}

function monthToDate(monthStr) {
  const months = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  };
  const parts = monthStr.split(' ');
  if (parts.length !== 2) return null;
  const mm = months[parts[0]];
  return mm ? `${parts[1]}-${mm}-01` : null;
}

function monthLabelFromIso(iso) {
  const [y, m] = iso.split('-');
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[Number(m) - 1]} ${y}`;
}

async function main() {
  const t0 = Date.now();
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Fast Holdings Seed');
  console.log('═══════════════════════════════════════════════════════════');

  const holdingsData = readJSON('fund-holdings.json');
  if (!holdingsData?.holdings) {
    console.log('No holdings data');
    return;
  }

  const jsonMonths = holdingsData.months || [];
  let targetMonthLabels;
  if (fullReload) {
    targetMonthLabels = jsonMonths;
    console.log('  Mode: FULL reload (all months)');
  } else if (monthArg) {
    targetMonthLabels = [monthLabelFromIso(monthArg)];
    console.log(`  Mode: single month (${monthArg})`);
  } else {
    targetMonthLabels = jsonMonths.length ? [jsonMonths[jsonMonths.length - 1]] : [];
    console.log(`  Mode: INCREMENTAL (latest month: ${targetMonthLabels[0] || 'none'})`);
  }

  const targetDates = new Set(targetMonthLabels.map(monthToDate).filter(Boolean));

  const fundRows = await sql`SELECT id, slug, name, amc_id FROM funds`;
  const amcRows = await sql`SELECT id, name, slug FROM amcs`;
  const resolveFundId = buildFundMatcher(fundRows, amcRows);

  const stockRows = await sql`SELECT id, slug FROM stocks`;
  const stockIdMap = Object.fromEntries(stockRows.map((r) => [r.slug, r.id]));

  console.log(`  Funds: ${fundRows.length}, Stocks: ${stockRows.length}`);

  if (fullReload) {
    await sql`DELETE FROM holdings_changes`;
    await sql`DELETE FROM fund_holdings`;
    console.log('  Cleared all holdings');
  } else {
    for (const d of targetDates) {
      await sql`DELETE FROM holdings_changes WHERE month = ${d}::DATE`;
      await sql`DELETE FROM fund_holdings WHERE month = ${d}::DATE`;
    }
    console.log(`  Cleared ${targetDates.size} month(s) for refresh`);
  }

  console.log('\n  📋 Building rows...');
  const allRows = [];
  let matchedFunds = 0;
  let unmatchedFunds = 0;

  for (const [fundSlug, fundData] of Object.entries(holdingsData.holdings)) {
    const fundId = resolveFundId(fundSlug, fundData);
    if (!fundId) {
      unmatchedFunds++;
      continue;
    }
    matchedFunds++;

    for (const monthStr of Object.keys(fundData).filter((k) => k !== 'name' && k !== 'amc')) {
      const monthDate = monthToDate(monthStr);
      if (!monthDate || !targetDates.has(monthDate)) continue;

      const holdings = fundData[monthStr];
      if (!Array.isArray(holdings)) continue;

      for (const h of holdings) {
        const stockId = stockIdMap[slugify(h.name)];
        if (!stockId) continue;
        allRows.push({
          fund_id: fundId,
          stock_id: stockId,
          month: monthDate,
          quantity: h.quantity ?? null,
          market_value: h.value ?? null,
          pct_to_nav: h.pct ?? null,
        });
      }
    }
  }

  console.log(`  Matched funds: ${matchedFunds} (${unmatchedFunds} unmatched)`);
  console.log(`  Rows to insert: ${allRows.length}`);

  // Dedupe (same fund+stock+month can appear from overlapping disclosure files)
  const seen = new Set();
  const dedupedRows = [];
  for (const row of allRows) {
    const key = `${row.fund_id}|${row.stock_id}|${row.month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedRows.push(row);
  }
  if (dedupedRows.length < allRows.length) {
    console.log(`  Deduped: ${allRows.length - dedupedRows.length} duplicate rows`);
  }

  if (dedupedRows.length === 0) {
    console.log('  Nothing to insert.');
    return;
  }

  const t1 = Date.now();
  console.log('\n  ⚡ Bulk inserting via Postgres UNNEST...');
  const inserted = await bulkUpsertFundHoldings(dedupedRows, 3000);
  await closePgPool();

  const t2 = Date.now();
  const [r] = await sql`SELECT COUNT(*)::int AS cnt FROM fund_holdings`;

  console.log(`\n  ✅ Inserted: ${inserted} holdings in ${((t2 - t1) / 1000).toFixed(1)}s`);
  console.log(`  DB total: ${r.cnt} holdings`);
  console.log(`  Total time: ${((t2 - t0) / 1000).toFixed(1)}s`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
