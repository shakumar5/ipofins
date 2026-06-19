#!/usr/bin/env node
/**
 * Pipeline 4 — Quarterly Expense Ratio (TER) from AMFI official API.
 *
 * Source: https://www.amfiindia.com/ter-of-mf-schemes
 * Refresh: run once per quarter (Jan/Apr/Jul/Oct) or anytime with --force
 *
 * Usage:
 *   npm run pipeline:ter
 *   npm run pipeline:ter -- --force
 *   npm run pipeline:ter -- --month 03-2026
 */

import { requireDb, upsertExpenseRatiosFromAMFI } from '../lib/db-writers.mjs';
import { fetchAMFITERRecords, financialYearForDate } from '../lib/amfi-ter.mjs';

const FORCE = process.argv.includes('--force');
const monthArg =
  process.argv.find((a) => a.startsWith('--month='))?.split('=')[1]
  || (process.argv.includes('--month') ? process.argv[process.argv.indexOf('--month') + 1] : null);

/** True when we're in the first month of a calendar quarter (run window). */
function isQuarterStartMonth(date = new Date()) {
  return [0, 3, 6, 9].includes(date.getMonth());
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 4 — Quarterly Expense Ratio (AMFI TER)');
  console.log('  Source: AMFI official API (ter-of-mf-schemes)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  if (!FORCE && !isQuarterStartMonth()) {
    console.log('\n  ⏭️  Outside quarterly window (Jan/Apr/Jul/Oct). Use --force to sync anyway.\n');
    return;
  }

  requireDb();
  const fy = financialYearForDate();

  console.log(`\n  [1/2] Fetching TER data (FY ${fy})...`);
  const { month, records } = await fetchAMFITERRecords(monthArg, fy);
  console.log(`    ✅ ${records.length} scheme rows for month ${month}`);

  console.log('\n  [2/2] Upserting expense_ratio to Neon...');
  const result = await upsertExpenseRatiosFromAMFI(records, month);
  console.log(
    `    ✅ Updated ${result.updated} funds (${result.matched} matched, ${result.unmatched} AMFI rows without DB match)`,
  );

  console.log('\n  ✅ Pipeline 4 complete — run `npm run build` to refresh fund pages\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 4 failed:', err.message);
  process.exit(1);
});
