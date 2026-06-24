#!/usr/bin/env node
/**
 * SI business-data snapshot — captures row counts + content checksums for every
 * table that pipelines 4/6/7/8 could mutate. Used to prove dry-run (and
 * post-run) leave business data untouched.
 *
 * Output: a JSON snapshot to stdout (and optional --out <file>).
 *
 * Tables covered (migration 005/006 — the four SI route pipelines):
 *   tracked_entities, tracked_entity_tags, entity_strategies,
 *   shareholding_pattern_holders, sast_filings, entity_holdings,
 *   entity_changes, entity_stock_signals, entity_quarterly_stats,
 *   entity_overlaps, entity_conviction, corporate_actions,
 *   pipeline_runs (metadata — tracked separately so it can be excluded).
 *
 * Checksum strategy: per-table, md5 of the table's full row set ordered by
 * primary key / stable columns. Any insert/update/delete flips the hash.
 * Count + max(updated_at|id) is also recorded for quick eyeballing.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..'); // script lives in scripts/ → .env is one dir up (finverseui/)

// Load .env
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}
const sql = neon(DATABASE_URL);

// table → { order, touchCol }
// touchCol: a column whose value changes on write (updated_at preferred, else id).
const TABLES = {
  tracked_entities:                 { order: 'id',        touchCol: 'updated_at' },
  tracked_entity_tags:              { order: 'entity_id, tag', touchCol: null },
  entity_strategies:                { order: 'id',        touchCol: null },
  shareholding_pattern_holders:     { order: 'id',        touchCol: 'id' },
  sast_filings:                     { order: 'id',        touchCol: 'id' },
  entity_holdings:                  { order: 'id',        touchCol: 'id' },
  entity_changes:                   { order: 'entity_id, strategy_id, stock_id, quarter', touchCol: null },
  entity_stock_signals:             { order: 'stock_id, quarter', touchCol: null },
  entity_quarterly_stats:           { order: 'entity_id, strategy_id, quarter', touchCol: null },
  entity_overlaps:                  { order: 'entity_a_id, entity_b_id, quarter', touchCol: null },
  entity_conviction:                { order: 'entity_id, strategy_id, stock_id, quarter', touchCol: null },
  corporate_actions:                { order: 'id',        touchCol: 'id' },
  // Metadata table — captured but flagged separately.
  pipeline_runs:                    { order: 'id',        touchCol: 'id' },
};

// Identifiers are from a hardcoded allowlist (TABLES map), never user input —
// safe to interpolate directly. Use sql.query for the dynamic-identifier form.
async function checksumTable(table, order) {
  // row_to_json over the whole table ordered by a stable key, hashed.
  // Returns { count, hash, error }. NULL hash = empty table (count 0).
  const q = `SELECT md5(COALESCE(string_agg(md5(t::text), ',' ORDER BY ${order}), '')) AS hash,
                    count(*)::int AS count
             FROM ${table} AS t`;
  try {
    const rows = await sql.query(q, []);
    return { count: rows[0].count ?? 0, hash: rows[0].hash ?? null };
  } catch (err) {
    if (/relation .* does not exist/i.test(err.message)) {
      return { count: null, hash: null, error: 'MISSING_TABLE' };
    }
    return { count: null, hash: null, error: err.message };
  }
}

async function touchHighWater(table, touchCol) {
  if (!touchCol) return null;
  const q = `SELECT MAX(${touchCol})::text AS v FROM ${table}`;
  try {
    const rows = await sql.query(q, []);
    return rows[0]?.v ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const label = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] || 'snapshot';
  const out = {};
  for (const [table, cfg] of Object.entries(TABLES)) {
    const cs = await checksumTable(table, cfg.order);
    const hwm = await touchHighWater(table, cfg.touchCol);
    out[table] = { ...cs, touchHighWater: hwm };
  }

  // Dedicated SAST preliminary slice — the exact rows pipeline 8 writes.
  let sastPrelim = null;
  try {
    sastPrelim = (await sql`
      SELECT count(*)::int AS c,
             max(id)::text AS max_id
      FROM sast_filings WHERE is_preliminary = true
    `)[0];
  } catch (err) {
    sastPrelim = { error: err.message };
  }

  // Preliminary entity_holdings (source='sast') — the other pipeline-8 write target.
  let ehPrelim = null;
  try {
    ehPrelim = (await sql`
      SELECT count(*)::int AS c,
             max(id)::text AS max_id
      FROM entity_holdings WHERE is_preliminary = true
    `)[0];
  } catch (err) {
    ehPrelim = { error: err.message };
  }

  const snapshot = {
    label,
    capturedAt: new Date().toISOString(),
    tables: out,
    sastFilings_preliminary: sastPrelim,
    entityHoldings_preliminary: ehPrelim,
  };

  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((e) => {
  console.error('❌ snapshot failed:', e);
  process.exit(1);
});
