#!/usr/bin/env node
/**
 * Pipeline 1 — Daily NAV & IPO List (manual)
 *
 * Sources: AMFI (NAV) | Zerodha + Groww (IPOs)
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

const __dirname = dirname(fileURLToPath(import.meta.url));

function runIPOSync() {
  return new Promise((resolve, reject) => {
    const script = join(__dirname, '00-ipo-broker-sync.mjs');
    const child = spawn(process.execPath, ['--use-system-ca', script, '--no-clean'], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`IPO sync exited ${code}`))));
  });
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 1 — Daily NAV & IPO List');
  console.log('  Sources: AMFI | Zerodha | Groww');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  const amfiFunds = await fetchAMFINAVs();
  await upsertFundsFromAMFI(amfiFunds);
  await computeFundReturnsFromNavs();

  await runIPOSync();

  console.log('\n  ✅ Pipeline 1 complete — data written to Neon');
  console.log('  ℹ️  Run `npm run build` to regenerate static pages\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 1 failed:', err.message);
  process.exit(1);
});
