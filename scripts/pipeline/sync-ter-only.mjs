#!/usr/bin/env node
/**
 * Sync expense ratio (TER) from AMFI official API → Neon funds.expense_ratio
 *
 * Used by: monthly holdings pipeline (`03-monthly-mf-holdings.mjs`), `npm run pipeline:ter` (manual)
 * Source:  https://www.amfiindia.com/ter-of-mf-schemes
 */

import { requireDb, syncExpenseRatiosFromAMFI } from '../lib/db-writers.mjs';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AMFI Expense Ratio (TER) Sync');
  console.log('  Source: AMFI official API');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  console.log('\n  [1/1] Fetching TER + upserting to Neon...');
  const result = await syncExpenseRatiosFromAMFI();
  console.log(
    `    ✅ TER ${result.month}: updated ${result.updated} funds (${result.matched} matched, ${result.records} AMFI rows)`,
  );

  console.log('\n  ✅ TER sync complete — run `npm run build` to refresh fund detail pages\n');
}

main().catch((err) => {
  console.error('\n  ❌ TER sync failed:', err.message);
  process.exit(1);
});
