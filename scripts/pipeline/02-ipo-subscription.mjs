#!/usr/bin/env node
/**
 * Pipeline 2 — IPO Subscription refresh (Groww)
 * Run hourly during open IPO season.
 */

import { fetchGrowwSubscription } from '../lib/groww-sources.mjs';
import { requireDb, upsertIPOSubscriptionsFromIPOs } from '../lib/db-writers.mjs';
import { sql } from '../lib/db.mjs';
import { fuzzyMatch } from '../lib/ipo-utils.mjs';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 2 — IPO Subscription (Groww)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  const subData = await fetchGrowwSubscription();
  if (subData.length === 0) {
    console.log('\n  ⚠️  No subscription data from Groww\n');
    return;
  }

  const dbIpos = await sql`SELECT id, slug, name FROM ipos`;
  const iposToUpdate = [];

  for (const entry of subData) {
    const match = dbIpos.find((ipo) => fuzzyMatch(ipo.name, entry.name));
    if (!match) continue;
    iposToUpdate.push({
      slug: match.slug,
      name: match.name,
      subscription: entry.total,
      subscriptionDetails: {
        retail: entry.retail,
        nii: entry.nii,
        qib: entry.qib,
        employee: entry.employee,
      },
    });
  }

  await upsertIPOSubscriptionsFromIPOs(iposToUpdate);
  console.log('\n  ✅ Pipeline 2 complete\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 2 failed:', err.message);
  process.exit(1);
});
