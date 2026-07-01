#!/usr/bin/env node
/**
 * Daily cron — NAV + IPO (status, details, performance) + subscription.
 * Weekdays 9 AM IST via GitHub Actions (pipeline-daily.yml).
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
const QUICK = process.argv.includes('--quick');

function runScript(scriptName, extraArgs = []) {
  const script = scriptName.endsWith('verify-schema.mjs')
    ? resolve(__dirname, '..', '..', 'db', 'verify-schema.mjs')
    : join(__dirname, scriptName);
  return new Promise((resolvePromise, reject) => {
    const args = [...nodeExtraArgs(), script, ...extraArgs];
    const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });
}

async function syncNav() {
  console.log('\n  [1/3] NAV sync (AMFI)...');
  const navStart = Date.now();
  const amfiFunds = await fetchAMFINAVs();
  await upsertFundsFromAMFI(amfiFunds);
  await computeFundReturnsFromNavs();
  console.log(`  [1/3] NAV done in ${((Date.now() - navStart) / 1000).toFixed(1)}s`);
}

async function main() {
  const totalStart = Date.now();
  console.log('');
  console.log('  Daily cron — NAV + IPO + Subscription');
  console.log(`  IPO mode: ${QUICK ? 'quick' : 'full (statuses + performance)'}`);
  console.log(`  ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  requireDb();
  await syncNav();
  const ipoArgs = ['--no-clean'];
  if (QUICK) ipoArgs.push('--quick');
  console.log('\n  [2/3] IPO sync...');
  await runScript('00-ipo-broker-sync.mjs', ipoArgs);
  console.log('\n  [3/3] Subscription...');
  await runScript('02-ipo-subscription.mjs');
  await runScript('verify-schema.mjs');
  console.log(`\n  Daily cron complete in ${((Date.now() - totalStart) / 1000).toFixed(1)}s\n`);
}

main().catch((err) => {
  console.error('\n  Daily cron failed:', err.message);
  process.exit(1);
});
