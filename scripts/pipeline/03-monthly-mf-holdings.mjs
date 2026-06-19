#!/usr/bin/env node
/**
 * Pipeline 3 — Monthly Mutual Fund Holdings
 *
 * Default (incremental): parse latest month → fix AMCs → seed latest month → compute latest month only
 * Full reload: npm run pipeline:monthly -- --full
 */

import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { requireDb } from '../lib/db-writers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const fullReload = args.includes('--full');

function run(cmd, label) {
  console.log(`\n  ▶ ${label}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pipeline 3 — Monthly MF Holdings');
  console.log(`  Mode: ${fullReload ? 'FULL (all months)' : 'INCREMENTAL (latest month only)'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📅 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);

  requireDb();

  const parseFlags = fullReload ? '' : ' --incremental';
  run(`node scripts/parse-holdings.mjs${parseFlags}`, 'Parse Excel → fund-holdings.json');
  run('node --use-system-ca db/seed/fix-amc-assignments.mjs', 'Fix AMCs + sync missing funds');

  const seedFlags = fullReload ? ' --full' : '';
  run(`node --use-system-ca db/seed/seed-holdings-batch.mjs${seedFlags}`, 'Seed holdings into Neon');
  run('node --use-system-ca db/seed/dedupe-stocks-canonical.mjs', 'Deduplicate stocks + remove debt rows');
  run('node --use-system-ca scripts/export-client-data.mjs', 'Export client JSON (holdings, smart money)');

  const { neon } = await import('@neondatabase/serverless');
  const { readFileSync } = await import('fs');
  const envContent = readFileSync(join(ROOT, '.env'), 'utf-8');
  const dbUrl = envContent.match(/DATABASE_URL=(.+)/)[1].trim();
  const sql = neon(dbUrl);

  if (fullReload) {
    const monthRows = await sql`SELECT DISTINCT month::text AS month FROM fund_holdings ORDER BY month ASC`;
    for (const row of monthRows) {
      run(`node --use-system-ca db/compute/compute-signals.mjs --month=${row.month}`, `Compute signals for ${row.month}`);
    }
  } else {
    const [latest] = await sql`SELECT month::text AS month FROM fund_holdings ORDER BY month DESC LIMIT 1`;
    const m = latest?.month;
    if (!m) {
      console.error('\n  ❌ No holdings in fund_holdings');
      process.exit(1);
    }
    run(`node --use-system-ca db/compute/compute-signals.mjs --month=${m}`, `Compute signals for ${m}`);
  }

  run('node --use-system-ca db/compute/compute-overlaps.mjs', 'Compute fund overlaps (latest month)');

  console.log('\n  ✅ Pipeline 3 complete');
  console.log('  ℹ️  Full reload: npm run pipeline:monthly -- --full\n');
}

main().catch((err) => {
  console.error('\n  ❌ Pipeline 3 failed:', err.message);
  process.exit(1);
});
