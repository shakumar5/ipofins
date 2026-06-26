#!/usr/bin/env node
/**
 * Audit duplicate rows in Super Investor / 1% Club tables.
 * Exit 1 if any duplicate groups remain.
 *
 * Usage: node scripts/node-with-ca.mjs db/audit-si-duplicates.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL || (() => {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  return readFileSync(envPath, 'utf-8').match(/DATABASE_URL=(.+)/)?.[1]?.trim();
})();

if (!url) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = neon(url);

function report(label, row) {
  const groups = Number(row?.groups ?? 0);
  const extra = Number(row?.extra_rows ?? 0);
  const ok = groups === 0;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${groups} duplicate groups (${extra} extra rows)`);
  return ok;
}

async function main() {
  console.log('\nSuper Investor duplicate audit\n');

  const [schema] = await sql`
    SELECT to_regclass('public.entity_holdings') IS NOT NULL AS present
  `;
  if (!schema?.present) {
    console.log('Super-investor schema not present — skip.');
    return;
  }

  const [dupNse] = await sql`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
    FROM (
      SELECT COUNT(*)::int AS cnt
      FROM stocks
      WHERE NULLIF(TRIM(nse_symbol), '') IS NOT NULL
      GROUP BY UPPER(TRIM(nse_symbol)) HAVING COUNT(*) > 1
    ) x
  `;
  const [dupIsin] = await sql`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
    FROM (
      SELECT COUNT(*)::int AS cnt
      FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NOT NULL
      GROUP BY UPPER(TRIM(isin)) HAVING COUNT(*) > 1
    ) x
  `;
  const [dupEh] = await sql`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
    FROM (
      SELECT COUNT(*)::int AS cnt
      FROM entity_holdings eh
      JOIN stocks s ON s.id = eh.stock_id
      WHERE eh.strategy_id IS NULL
      GROUP BY eh.entity_id, eh.quarter,
        COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug)
      HAVING COUNT(*) > 1
    ) x
  `;
  const [dupEc] = await sql`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
    FROM (
      SELECT COUNT(*)::int AS cnt
      FROM entity_changes ec
      JOIN stocks s ON s.id = ec.stock_id
      WHERE ec.strategy_id IS NULL
      GROUP BY ec.entity_id, ec.quarter,
        COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug)
      HAVING COUNT(*) > 1
    ) x
  `;
  const [dupSph] = await sql`
    SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
    FROM (
      SELECT COUNT(*)::int AS cnt
      FROM shareholding_pattern_holders sph
      JOIN stocks s ON s.id = sph.stock_id
      GROUP BY sph.quarter,
        COALESCE(NULLIF(TRIM(s.nse_symbol), ''), s.slug),
        LOWER(TRIM(sph.holder_name))
      HAVING COUNT(*) > 1
    ) x
  `;

  const ok =
    report('stocks — duplicate NSE symbols', dupNse) &&
    report('stocks — duplicate ISINs', dupIsin) &&
    report('entity_holdings — same entity + quarter + symbol', dupEh) &&
    report('entity_changes — same entity + quarter + symbol', dupEc) &&
    report('shareholding_pattern_holders — same quarter + symbol + holder', dupSph);

  if (!ok) {
    console.error('\n❌ Duplicate groups remain. Run: npm run db:dedupe-all\n');
    process.exit(1);
  }

  console.log('\n✅ No duplicate groups detected.\n');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
