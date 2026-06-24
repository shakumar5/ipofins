#!/usr/bin/env node
/**
 * One-off status check for the four "smart money people" tables.
 * Reports row counts so we can see whether the seed + pipeline have run.
 *
 * Uses `pg` (not neon-serverless) so we can parameterize / interpolate table
 * names safely for this introspection query.
 *
 * Usage: node scripts/node-with-ca.mjs scripts/check-tracked-status.mjs
 */
import { readFileSync } from 'fs';
import pg from 'pg';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf-8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!dbUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

console.log('═'.repeat(62));
console.log('  Finverse — Tracked-Entities (4 features) DB status');
console.log('═'.repeat(62));

// 1) Which of the 005/006 tables exist?
const wanted = [
  'tracked_entities',
  'tracked_entity_tags',
  'entity_strategies',
  'entity_holdings',
  'entity_changes',
  'entity_quarterly_stats',
  'shareholding_pattern_holders',
  'pms_holdings',
  'aif_holdings',
];

console.log('\nRow counts (table → count):');
for (const t of wanted) {
  const exists = await client.query(
    `SELECT to_regclass($1) AS r`, [t]
  );
  let c;
  if (exists.rows[0].r) {
    // table name is from a fixed allow-list → safe to interpolate
    const r = await client.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
    c = r.rows[0].c;
  } else {
    c = null;
  }
  console.log(
    `  ${t.padEnd(32)} ${c == null ? '  MISSING' : String(c).padStart(8)}`
  );
}

// 2) tracked_entities by type
console.log('\ntracked_entities by type:');
try {
  const r = await client.query(
    `SELECT type, COUNT(*)::int AS c FROM tracked_entities GROUP BY type ORDER BY c DESC`
  );
  if (r.rows.length === 0) console.log('  (table empty)');
  for (const row of r.rows) console.log(`  ${row.type.padEnd(20)} ${row.c}`);
} catch (e) {
  console.log('  (table missing)', e.message);
}

// 3) shareholding_pattern_holders (≥1% non-promoter)
console.log('\nshareholding_pattern_holders (≥1% non-promoter):');
try {
  const r = await client.query(
    `SELECT MAX(quarter)::text AS q, COUNT(*)::int AS c
       FROM shareholding_pattern_holders
      WHERE is_promoter = FALSE AND pct_of_company >= 1.0`
  );
  console.log(`  latest quarter: ${r.rows[0].q}, total ≥1% non-promoter rows: ${r.rows[0].c}`);
} catch (e) {
  console.log('  (table missing)', e.message);
}

// 4) entity_quarterly_stats
console.log('\nentity_quarterly_stats (strategy_id IS NULL):');
try {
  const r = await client.query(
    `SELECT MAX(quarter)::text AS q, COUNT(*)::int AS c,
            COUNT(DISTINCT entity_id)::int AS ent
       FROM entity_quarterly_stats WHERE strategy_id IS NULL`
  );
  console.log(`  latest quarter: ${r.rows[0].q}, rows: ${r.rows[0].c}, distinct entities: ${r.rows[0].ent}`);
} catch (e) {
  console.log('  (table missing)', e.message);
}

await client.end();
console.log('\n' + '═'.repeat(62));
