/**
 * Move fund_holdings from parser duplicate funds onto canonical Direct Plan rows.
 * Usage: node --use-system-ca db/seed/reassign-holdings-canonical.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import {
  normalizeFundName,
  fundQualityScore,
  isMangledFund,
} from '../../scripts/lib/fund-match.mjs';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
process.env.DATABASE_URL = dbUrl;
const sql = neon(dbUrl);

async function main() {
  const amcRows = await sql`SELECT id, name FROM amcs`;
  const amcNameById = Object.fromEntries(amcRows.map((a) => [a.id, a.name]));
  const funds = await sql`
    SELECT id, slug, name, amc_id, scheme_code
    FROM funds WHERE is_active = true
  `;
  const heldIds = new Set(
    (await sql`SELECT DISTINCT fund_id FROM fund_holdings`).map((r) => r.fund_id)
  );

  const groups = new Map();
  for (const fund of funds) {
    const norm = normalizeFundName(fund.name, amcNameById[fund.amc_id] || '');
    const key = `${fund.amc_id}|${norm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fund);
  }

  const pool = getPgPool();
  let moved = 0;
  let deactivated = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort((a, b) => fundQualityScore(b) - fundQualityScore(a))[0];

    for (const src of group) {
      if (src.id === canonical.id || !heldIds.has(src.id)) continue;

      await pool.query(
        `INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
         SELECT $1, stock_id, month, quantity, market_value, pct_to_nav
         FROM fund_holdings WHERE fund_id = $2
         ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
           quantity = EXCLUDED.quantity,
           market_value = EXCLUDED.market_value,
           pct_to_nav = EXCLUDED.pct_to_nav`,
        [canonical.id, src.id]
      );
      const del = await pool.query(`DELETE FROM fund_holdings WHERE fund_id = $1`, [src.id]);
      moved += del.rowCount ?? 0;
      heldIds.delete(src.id);
      heldIds.add(canonical.id);

      if (isMangledFund(src)) {
        await pool.query(`UPDATE funds SET is_active = false WHERE id = $1`, [src.id]);
        deactivated++;
      }
    }
  }

  await closePgPool();
  console.log(`\n✅ Reassigned holdings to canonical Direct Plan funds`);
  console.log(`   Holdings rows moved: ${moved}`);
  console.log(`   Deactivated mangled duplicates: ${deactivated}\n`);
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
