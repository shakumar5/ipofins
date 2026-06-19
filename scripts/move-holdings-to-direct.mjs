/**
 * Move holdings onto Direct Plan fund when a sibling row in the same scheme family holds them.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { normalizeFundName, fundQualityScore } from '../../scripts/lib/fund-match.mjs';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbUrl = readFileSync(join(ROOT, '.env'), 'utf-8').match(/DATABASE_URL=(.+)/)[1].trim();
process.env.DATABASE_URL = dbUrl;
const sql = neon(dbUrl);

const amcNameById = Object.fromEntries((await sql`SELECT id, name FROM amcs`).map((a) => [a.id, a.name]));
const funds = await sql`SELECT id, slug, name, amc_id, scheme_code FROM funds WHERE is_active = true`;
const held = new Set((await sql`SELECT DISTINCT fund_id FROM fund_holdings`).map((r) => r.fund_id));

const groups = new Map();
for (const f of funds) {
  const key = `${f.amc_id}|${normalizeFundName(f.name, amcNameById[f.amc_id] || '')}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(f);
}

const pool = getPgPool();
let moved = 0;

for (const group of groups.values()) {
  const canonical = [...group].sort((a, b) => fundQualityScore(b) - fundQualityScore(a))[0];
  for (const src of group) {
    if (src.id === canonical.id || !held.has(src.id)) continue;
    await pool.query(
      `INSERT INTO fund_holdings (fund_id, stock_id, month, quantity, market_value, pct_to_nav)
       SELECT $1, stock_id, month, quantity, market_value, pct_to_nav
       FROM fund_holdings WHERE fund_id = $2
       ON CONFLICT (fund_id, stock_id, month) DO UPDATE SET
         quantity = EXCLUDED.quantity, market_value = EXCLUDED.market_value, pct_to_nav = EXCLUDED.pct_to_nav`,
      [canonical.id, src.id]
    );
    const del = await pool.query(`DELETE FROM fund_holdings WHERE fund_id = $1`, [src.id]);
    moved += del.rowCount ?? 0;
    held.delete(src.id);
    held.add(canonical.id);
    console.log(`  ${src.slug} → ${canonical.slug} (${del.rowCount} rows)`);
  }
}

await closePgPool();
console.log(`\nDone. Moved ${moved} holding rows.\n`);
