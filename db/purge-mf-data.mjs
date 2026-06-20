#!/usr/bin/env node
/**
 * Purge mutual-fund data from Neon. IPO tables are preserved.
 *
 * Usage: node scripts/node-with-ca.mjs db/purge-mf-data.mjs
 *        node scripts/node-with-ca.mjs db/purge-mf-data.mjs --confirm
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (!args.includes('--confirm')) {
  console.error('\n  ⚠️  This deletes ALL mutual-fund rows (funds, holdings, signals, overlaps, NAV).');
  console.error('  IPO tables are preserved.');
  console.error('  Re-run with --confirm to proceed.\n');
  process.exit(1);
}

const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(dbUrl);

console.log('\n  🗑️  Purging mutual-fund data (IPOs preserved)...\n');

const steps = [
  ['fund_overlaps', sql`DELETE FROM fund_overlaps`],
  ['holdings_changes', sql`DELETE FROM holdings_changes`],
  ['stock_signals', sql`DELETE FROM stock_signals`],
  ['sector_allocations', sql`DELETE FROM sector_allocations`],
  ['amc_monthly_stats', sql`DELETE FROM amc_monthly_stats`],
  ['fund_holdings', sql`DELETE FROM fund_holdings`],
  ['fund_portfolio_stats', sql`DELETE FROM fund_portfolio_stats`],
  ['fund_returns', sql`DELETE FROM fund_returns`],
  ['fund_navs', sql`DELETE FROM fund_navs`],
  ['funds', sql`DELETE FROM funds`],
  ['amcs', sql`DELETE FROM amcs`],
  [
    'stocks (non-IPO)',
    sql`DELETE FROM stocks WHERE id NOT IN (SELECT stock_id FROM ipos WHERE stock_id IS NOT NULL)`,
  ],
];

for (const [label, query] of steps) {
  await query;
  console.log(`    ✓ cleared ${label}`);
}

const [counts] = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM funds) AS funds,
    (SELECT COUNT(*)::int FROM fund_holdings) AS fund_holdings,
    (SELECT COUNT(*)::int FROM ipos) AS ipos
`;

console.log('\n  After purge:');
console.log(`    funds:          ${counts.funds}`);
console.log(`    fund_holdings:  ${counts.fund_holdings}`);
console.log(`    ipos (kept):    ${counts.ipos}`);
console.log('\n  ✅ MF purge complete\n');
