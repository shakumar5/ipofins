#!/usr/bin/env node
/**
 * IPO Post-Listing Prices - fill current_price + price_1w..price_1y (+ returns)
 * for listed IPOs from the daily close series (Yahoo Finance).
 *
 * Usage:
 *   npm run pipeline:ipo-performance               # fetch + write to Neon
 *   npm run pipeline:ipo-performance -- --dry-run  # fetch + log only (no writes)
 */

import { requireDb, updateIPOPostListingPerformance } from '../lib/db-writers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log('');
  console.log('===========================================================');
  console.log('  IPO Post-Listing Prices -> Neon');
  console.log('===========================================================');
  console.log(`  Date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  if (DRY_RUN) console.log('  Dry run - no database writes');

  requireDb();

  const t0 = Date.now();
  const result = await updateIPOPostListingPerformance({ dryRun: DRY_RUN });
  console.log(
    `\n  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s - ` +
      `${result.updated}/${result.total} listed IPOs priced\n`,
  );
}

main().catch((err) => {
  console.error('\n  IPO post-listing prices failed:', err.message);
  process.exit(1);
});
