/**
 * Merge duplicate mutual fund rows and delete dup fund records.
 * Usage: node scripts/node-with-ca.mjs db/seed/dedupe-funds-canonical.mjs
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
const FUND_CHILD_TABLES = [
  { table: 'fund_holdings', conflict: ['stock_id', 'month'] },
  { table: 'holdings_changes', conflict: ['stock_id', 'month'] },
  { table: 'fund_navs', conflict: ['date'] },
  { table: 'fund_returns', conflict: [] },
  { table: 'fund_portfolio_stats', conflict: ['month'] },
];

async function remapFundChildTables(client, pairs) {
  if (!pairs.length) return;
  await client.query(`DROP TABLE IF EXISTS fund_dup_map`);
  await client.query(
    `CREATE TEMP TABLE fund_dup_map (dup_id INT PRIMARY KEY, canonical_id INT NOT NULL) ON COMMIT DROP`,
  );
  for (const [dupId, canonicalId] of pairs) {
    await client.query(
      `INSERT INTO fund_dup_map (dup_id, canonical_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [dupId, canonicalId],
    );
  }

  for (const { table, conflict } of FUND_CHILD_TABLES) {
    const exists = (await client.query(`SELECT to_regclass('public.${table}') IS NOT NULL AS present`))
      .rows[0]?.present;
    if (!exists) continue;

    const onClause = conflict.length
      ? ` AND ${conflict.map((c) => `t.${c} = t2.${c}`).join(' AND ')}`
      : '';
    await client.query(`
      DELETE FROM ${table} t
      USING fund_dup_map m, ${table} t2, fund_dup_map m2
      WHERE t.fund_id = m.dup_id AND t2.fund_id = m2.dup_id
        AND m.canonical_id = m2.canonical_id AND m.dup_id > m2.dup_id${onClause}
    `);
    await client.query(`
      DELETE FROM ${table} t USING fund_dup_map m, ${table} t2
      WHERE t.fund_id = m.dup_id AND t2.fund_id = m.canonical_id${onClause}
    `);
    await client.query(
      `UPDATE ${table} t SET fund_id = m.canonical_id FROM fund_dup_map m WHERE t.fund_id = m.dup_id`,
    );
  }

  await client.query(`DELETE FROM funds f USING fund_dup_map m WHERE f.id = m.dup_id`);
}

function buildNameGroups(funds, amcNameById) {
  const groups = new Map();
  for (const fund of funds) {
    const norm = normalizeFundName(fund.name, amcNameById[fund.amc_id] || '');
    const key = `${fund.amc_id}|${norm}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fund);
  }
  return groups;
}

function pairsFromGroups(groups) {
  const pairs = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort((a, b) => fundQualityScore(b) - fundQualityScore(a))[0];
    for (const f of group) {
      if (f.id !== canonical.id) pairs.push([f.id, canonical.id]);
    }
  }
  return pairs;
}


async function main() {
  console.log('\n  Finverse - Deduplicate Mutual Funds\n');
  const before = (await sql`SELECT COUNT(*)::int AS c FROM funds`)[0].c;
  const amcRows = await sql`SELECT id, name FROM amcs`;
  const amcNameById = Object.fromEntries(amcRows.map((a) => [a.id, a.name]));
  const funds = await sql`SELECT id, slug, name, amc_id, scheme_code FROM funds`;

  const schemeGroups = await sql`
    SELECT array_agg(id ORDER BY id) AS ids FROM funds
    WHERE NULLIF(TRIM(scheme_code), '') IS NOT NULL
    GROUP BY UPPER(TRIM(scheme_code)) HAVING COUNT(*) > 1
  `;
  const schemePairs = [];
  for (const row of schemeGroups) {
    for (const dupId of row.ids.slice(1)) schemePairs.push([dupId, row.ids[0]]);
  }
  const namePairs = pairsFromGroups(buildNameGroups(funds, amcNameById));

  const pool = getPgPool();
  const client = await pool.connect();
  let deactivated = 0;
  try {
    await client.query('BEGIN');
    if (schemePairs.length) await remapFundChildTables(client, schemePairs);
    if (namePairs.length) await remapFundChildTables(client, namePairs);
    for (const group of buildNameGroups(funds, amcNameById).values()) {
      if (group.length < 2) continue;
      const canonical = [...group].sort(
        (a, b) => (isMangledFund(a) ? 0 : 1) - (isMangledFund(b) ? 0 : 1) || fundQualityScore(b) - fundQualityScore(a),
      )[0];
      for (const f of group) {
        if (f.id === canonical.id || !isMangledFund(f)) continue;
        const held = await client.query(`SELECT 1 FROM fund_holdings WHERE fund_id = $1 LIMIT 1`, [f.id]);
        if (held.rowCount) continue;
        await client.query(`UPDATE funds SET is_active = false WHERE id = $1`, [f.id]);
        deactivated++;
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await closePgPool();
  }

  const after = (await sql`SELECT COUNT(*)::int AS c FROM funds`)[0].c;
  console.log(`  Merged by scheme_code: ${schemePairs.length}`);
  console.log(`  Merged by AMC+name:     ${namePairs.length}`);
  console.log(`  Deactivated mangled:    ${deactivated}`);
  console.log(`  Funds: ${before} -> ${after}
`);
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('Error:', e.message);
  process.exit(1);
});
