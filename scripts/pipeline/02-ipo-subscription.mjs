#!/usr/bin/env node
/**
 * Pipeline 2 — IPO Subscription refresh (Groww)
 * Run hourly during open IPO season.
 */

import { fetchGrowwSubscription } from '../lib/groww-sources.mjs';
import { requireDb, upsertIPOSubscriptionsFromIPOs } from '../lib/db-writers.mjs';
import { sql } from '../lib/db.mjs';
import { fuzzyMatch } from '../lib/ipo-utils.mjs';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';

async function main() {
  const ctx = await startRun('ipo-subscription');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 2 — IPO Subscription (Groww)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  try {
    requireDb();

    const subData = await fetchGrowwSubscription();
    if (subData.length === 0) {
      console.log('\n  ⚠️  No subscription data from Groww\n');
      await endRun(ctx, { status: 'success', qualityGate: 'skipped', message: 'No Groww data', rowsUpserted: 0 });
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
    await endRun(ctx, {
      status: 'success',
      qualityGate: 'passed',
      rowsUpserted: iposToUpdate.length,
      message: `${iposToUpdate.length} IPOs updated`,
    });
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    throw err;
  }
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 2 failed:', err.message);
  process.exit(1);
});
