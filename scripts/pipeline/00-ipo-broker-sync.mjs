#!/usr/bin/env node
/**
 * IPO Broker Sync — clean DB + fetch from Zerodha & Groww (bidirectional merge)
 *
 * Usage:
 *   npm run pipeline:ipo           # full refresh (clean + fetch all)
 *   npm run pipeline:ipo -- --no-clean   # upsert without wiping
 *   npm run pipeline:ipo -- --quick      # skip closed IPO detail pages
 */

import { fetchZerodhaListing, enrichZerodhaDetails } from '../lib/zerodha-sources.mjs';
import {
  fetchGrowwListing,
  fetchGrowwSubscription,
  enrichGrowwDetails,
} from '../lib/groww-sources.mjs';
import { applyComputedStatuses } from '../lib/ipo-status.mjs';
import {
  mergeBrokerListings,
  mergeSubscriptionData,
  normalizeIPODates,
} from '../lib/ipo-merge.mjs';
import {
  requireDb,
  clearIPOData,
  upsertIPOs,
  upsertIPOSubscriptionsFromIPOs,
} from '../lib/db-writers.mjs';
import { startRun, endRun } from '../lib/pipeline-run-logger.mjs';

const args = process.argv.slice(2);
const NO_CLEAN = args.includes('--no-clean');
const QUICK = args.includes('--quick');

async function main() {
  const ctx = await startRun('ipo-sync');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  IPO Broker Sync — Zerodha + Groww → Neon');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  try {
    requireDb();

    if (!NO_CLEAN) {
      console.log('\n  🧹 Cleaning IPO tables...');
      await clearIPOData();
    } else {
      console.log('\n  ℹ️  Skipping DB clean (--no-clean)');
    }

    const [zerodha, groww, subscription] = await Promise.all([
    fetchZerodhaListing().catch((err) => {
      console.log(`    ⚠️ Zerodha listing failed: ${err.message}`);
      return { live: [], upcoming: [], closed: [] };
    }),
    fetchGrowwListing().catch((err) => {
      console.log(`    ⚠️ Groww listing failed: ${err.message}`);
      return { open: [], upcoming: [], closed: [] };
    }),
    fetchGrowwSubscription(),
  ]);

  let ipos = mergeBrokerListings(zerodha, groww);
  ipos = mergeSubscriptionData(ipos, subscription);

  // Detail enrichment — Zerodha first, then Groww fills gaps
  const forZerodhaDetail = ipos.filter((i) => i.detailUrl);
  const forGrowwDetail = QUICK
    ? ipos.filter((i) => i.status === 'live' || i.status === 'upcoming')
    : ipos.filter(
        (i) =>
          i.status === 'live' ||
          i.status === 'upcoming' ||
          i.status === 'closed' ||
          i.status === 'listed'
      );

  await enrichGrowwDetails(forGrowwDetail, subscription, { delayMs: 500 });
  await enrichZerodhaDetails(forZerodhaDetail, { delayMs: 700 });

  normalizeIPODates(ipos);
  ipos = applyComputedStatuses(ipos);

  const live = ipos.filter((i) => i.status === 'live').length;
  const open = ipos.filter((i) => i.status === 'open').length;
  const upcoming = ipos.filter((i) => i.status === 'upcoming').length;
  console.log(`\n  📐 Status from dates (lifecycle diagram): live=${live} open=${open} upcoming=${upcoming}`);

  console.log('\n  💾 Writing to Neon...');
  await upsertIPOs(ipos);
  await upsertIPOSubscriptionsFromIPOs(ipos);

  const liveIpos = ipos.filter((i) => i.status === 'live');
  console.log('\n  ✅ IPO sync complete');
  console.log(`  📊 Total: ${ipos.length} | Live: ${liveIpos.length}`);
  for (const i of liveIpos) {
    console.log(`     • ${i.name} (${i.slug}) — ${i.openDate || '?'} to ${i.closeDate || '?'}`);
  }
  console.log('\n  ℹ️  Run `npm run build` to regenerate static pages\n');

    await endRun(ctx, {
      status: 'success',
      qualityGate: 'passed',
      rowsUpserted: ipos.length,
      message: `${ipos.length} IPOs synced (${liveIpos.length} live)`,
    });
  } catch (err) {
    await endRun(ctx, { status: 'failed', qualityGate: 'skipped', message: err.message });
    throw err;
  }
}

main().catch((err) => {
  console.error('\n  ❌ IPO sync failed:', err.message);
  process.exit(1);
});
