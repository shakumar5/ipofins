#!/usr/bin/env node
/**
 * Pre-deploy data refresh — one run covers NAV, IPO listings, and IPO subscription.
 *
 * Usage:
 *   npm run pipeline:predeploy
 *   npm run deploy:once          # this pipeline + forced export + full build
 */
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { nodeExtraArgs } from '../lib/node-runner.mjs';
import { fetchAMFINAVs } from '../lib/authorized-sources.mjs';
import {
  requireDb,
  upsertFundsFromAMFI,
  computeFundReturnsFromNavs,
} from '../lib/db-writers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function runScript(scriptName, extraArgs = []) {
  const script = scriptName.endsWith('verify-schema.mjs')
    ? resolve(__dirname, '..', '..', 'db', 'verify-schema.mjs')
    : join(__dirname, scriptName);
  return new Promise((resolve, reject) => {
    const args = [...nodeExtraArgs(), script, ...extraArgs];
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

async function syncNav() {
  console.log('\n  [1/4] NAV sync (AMFI)...');
  const navStart = Date.now();
  const amfiFunds = await fetchAMFINAVs();
  await upsertFundsFromAMFI(amfiFunds);
  await computeFundReturnsFromNavs();
  console.log(`  [1/4] NAV done in ${((Date.now() - navStart) / 1000).toFixed(1)}s`);
}

async function main() {
  const totalStart = Date.now();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pre-deploy pipeline — NAV + IPO + Subscription');
  console.log('  Sources: AMFI | Zerodha | Groww');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  await syncNav();

  console.log('\n  [2/4] IPO sync (incremental, quick)...');
  const ipoStart = Date.now();
  await runScript('00-ipo-broker-sync.mjs', ['--no-clean', '--quick']);
  console.log(`  [2/4] IPO done in ${((Date.now() - ipoStart) / 1000).toFixed(1)}s`);

  console.log('\n  [3/4] IPO subscription refresh...');
  const subStart = Date.now();
  await runScript('02-ipo-subscription.mjs');
  console.log(`  [3/4] Subscription done in ${((Date.now() - subStart) / 1000).toFixed(1)}s`);

  console.log('\n  [4/4] IPO post-listing prices...');
  const perfStart = Date.now();
  await runScript('05-ipo-post-listing-prices.mjs').catch((err) =>
    console.warn(`  ⚠️  Post-listing prices step failed (non-fatal): ${err.message}`),
  );
  console.log(`  [4/4] Post-listing prices done in ${((Date.now() - perfStart) / 1000).toFixed(1)}s`);

  console.log('\n  🔍 Verifying Neon schema...');
  await runScript('verify-schema.mjs');

  const totalSec = ((Date.now() - totalStart) / 1000).toFixed(1);
  console.log(`\n  ✅ Pre-deploy pipeline complete in ${totalSec}s`);
  console.log('  ℹ️  Next: FORCE_EXPORT=1 npm run build  (or npm run deploy:once)\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pre-deploy pipeline failed:', err.message);
  process.exit(1);
});
