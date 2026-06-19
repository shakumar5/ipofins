#!/usr/bin/env node
/**
 * Pipeline 1 — Daily NAV & IPO List (manual)
 *
 * Sources: AMFI (NAV) | Zerodha + Groww (IPOs, quick mode = live/upcoming only)
 *
 * Usage:
 *   npm run pipeline:daily          # fast: NAV + IPO listing + quick detail enrich
 *   npm run pipeline:daily -- --full-ipo   # slow: enrich closed/listed IPO pages too
 */

import { fetchAMFINAVs } from '../lib/authorized-sources.mjs';
import {
  requireDb,
  upsertFundsFromAMFI,
  computeFundReturnsFromNavs,
} from '../lib/db-writers.mjs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nodeExtraArgs } from '../lib/node-runner.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FULL_IPO = process.argv.includes('--full-ipo');

function runIPOSync() {
  return new Promise((resolve, reject) => {
    const script = join(__dirname, '00-ipo-broker-sync.mjs');
    const args = [...nodeExtraArgs(), script, '--no-clean'];
    if (!FULL_IPO) args.push('--quick');

    const child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`IPO sync exited ${code}`))));
  });
}

async function main() {
  const totalStart = Date.now();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 1 — Daily NAV & IPO List');
  console.log('  Sources: AMFI | Zerodha | Groww');
  console.log(`  IPO mode: ${FULL_IPO ? 'full (slow)' : 'quick (live + upcoming only)'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  console.log('\n  [1/2] NAV sync (bulk)...');
  const navStart = Date.now();
  const amfiFunds = await fetchAMFINAVs();
  await upsertFundsFromAMFI(amfiFunds);
  await computeFundReturnsFromNavs();
  console.log(`  [1/2] NAV done in ${((Date.now() - navStart) / 1000).toFixed(1)}s`);

  console.log('\n  [2/2] IPO sync...');
  const ipoStart = Date.now();
  await runIPOSync();
  console.log(`  [2/2] IPO done in ${((Date.now() - ipoStart) / 1000).toFixed(1)}s`);

  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n  ✅ Pipeline 1 complete in ${totalSec}s — data written to Neon`);
  console.log('  ℹ️  Run `npm run build` to regenerate static pages\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 1 failed:', err.message);
  process.exit(1);
});
