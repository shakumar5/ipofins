#!/usr/bin/env node
/**
 * NAV-only sync from AMFI (no IPO scrape). Use before deploy when fund_navs is empty.
 * Run: npm run pipeline:nav
 */
import { fetchAMFINAVs } from '../lib/authorized-sources.mjs';
import { requireDb, upsertFundsFromAMFI, computeFundReturnsFromNavs } from '../lib/db-writers.mjs';

async function main() {
  const totalStart = Date.now();
  console.log('\n  💰 NAV sync from AMFI...');
  requireDb();

  const funds = await fetchAMFINAVs();

  console.log('  [1/2] Mapping & writing NAV (bulk)...');
  await upsertFundsFromAMFI(funds);

  console.log('  [2/2] Computing returns (bulk SQL)...');
  await computeFundReturnsFromNavs();

  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n  ✅ NAV sync complete in ${totalSec}s\n`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
