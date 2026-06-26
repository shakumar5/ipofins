/**
 * Re-resolve shareholding_pattern_holders → tracked_entities and rebuild
 * aggregated entity_holdings from SHP (sums trusts / alias filings per entity).
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/backfill-entity-resolution.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { buildEntityResolver } from '../../scripts/lib/entity-name-resolver.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
process.env.DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(process.env.DATABASE_URL);

const BATCH = 3000;

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Backfill entity resolution (SHP → curated)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const entities = await sql`SELECT * FROM tracked_entities WHERE is_active = true`;
  const resolver = buildEntityResolver(entities);
  console.log(`  Resolver: ${resolver.indexStats.entityCount} entities, ${resolver.indexStats.indexEntries} variants`);

  const sphRows = await sql`
    SELECT id, holder_name, entity_id, match_confidence
    FROM shareholding_pattern_holders
    WHERE is_promoter = FALSE
    ORDER BY id
  `;

  const updates = [];
  const clears = [];
  for (const row of sphRows) {
    const match = resolver.resolve(row.holder_name);
    const newEntityId = match?.entityId ?? null;
    const newConfidence = match?.confidence ?? null;
    const sameEntity =
      (row.entity_id == null && newEntityId == null) ||
      (row.entity_id != null && newEntityId != null && Number(row.entity_id) === newEntityId);
    const sameConf =
      row.match_confidence == null && newConfidence == null
        ? true
        : Number(row.match_confidence) === newConfidence;
    if (sameEntity && sameConf) continue;
    updates.push({
      id: row.id,
      entityId: newEntityId,
      confidence: newConfidence,
    });
    if (newEntityId == null && row.entity_id != null) clears.push(row.id);
  }
  console.log(`  Rows to update: ${updates.length} / ${sphRows.length} (${clears.length} clears)`);

  const pool = getPgPool();
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const ids = batch.map((b) => b.id);
    const entityIds = batch.map((b) => b.entityId);
    const confidences = batch.map((b) => b.confidence);
    const result = await pool.query(
      `
      UPDATE shareholding_pattern_holders sph SET
        entity_id = v.entity_id,
        match_confidence = v.confidence
      FROM (
        SELECT unnest($1::bigint[]) AS id,
               unnest($2::int[]) AS entity_id,
               unnest($3::numeric[]) AS confidence
      ) v
      WHERE sph.id = v.id
      `,
      [ids, entityIds, confidences],
    );
    updated += result.rowCount ?? 0;
    process.stdout.write(`\r  Updated ${Math.min(i + BATCH, updates.length)} / ${updates.length}…`);
  }
  console.log(`\n  SPH rows updated: ${updated}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const del = await client.query(`
      DELETE FROM entity_holdings
      WHERE strategy_id IS NULL AND source = 'shareholding_pattern'
    `);
    console.log(`  Cleared ${del.rowCount} entity_holdings rows (SHP-sourced)`);

    const ins = await client.query(`
      INSERT INTO entity_holdings (
        entity_id, strategy_id, stock_id, quarter,
        shares_held, pct_of_company, market_value_cr,
        is_encumbered, source, source_url, is_preliminary
      )
      SELECT
        sph.entity_id,
        NULL,
        sph.stock_id,
        sph.quarter,
        SUM(sph.shares)::bigint,
        ROUND(SUM(sph.pct_of_company)::numeric, 3),
        NULL,
        FALSE,
        'shareholding_pattern',
        MAX(sph.source_url),
        FALSE
      FROM shareholding_pattern_holders sph
      WHERE sph.entity_id IS NOT NULL
        AND sph.is_promoter = FALSE
        AND sph.pct_of_company >= 1.0
        AND COALESCE(sph.match_confidence, 0) >= 0.85
      GROUP BY sph.entity_id, sph.stock_id, sph.quarter
      ON CONFLICT (entity_id, strategy_id, stock_id, quarter) DO UPDATE SET
        shares_held = EXCLUDED.shares_held,
        pct_of_company = EXCLUDED.pct_of_company,
        source = EXCLUDED.source,
        source_url = EXCLUDED.source_url
    `);
    console.log(`  Rebuilt ${ins.rowCount} aggregated entity_holdings rows`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await closePgPool();
  }

  console.log('\n  Next: npm run db:compute-si:all\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
