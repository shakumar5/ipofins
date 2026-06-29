/**
 * Deduplicate Super Investor / 1% Club rows after stock merges.
 * Collapses residual duplicates that share the same NSE symbol (or slug) per entity/quarter.
 *
 * Usage: node scripts/node-with-ca.mjs db/seed/dedupe-super-investor-data.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { stockListingKeySql } from '../../scripts/lib/stock-listing-key.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
process.env.DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();

/** Canonical equity key — ISIN, then NSE, then BSE, then slug. */
const STOCK_KEY = stockListingKeySql('s');

async function siSchemaPresent(pool) {
  const result = await pool.query(`
    SELECT to_regclass('public.entity_holdings') IS NOT NULL AS present
  `);
  return Boolean(result.rows[0]?.present);
}

async function dedupeEntityHoldings(pool) {
  const result = await pool.query(`
    DELETE FROM entity_holdings eh
    USING (
      SELECT eh2.id,
        ROW_NUMBER() OVER (
          PARTITION BY eh2.entity_id, eh2.strategy_id, eh2.quarter, ${STOCK_KEY.replace(/\bs\./g, 's2.')}
          ORDER BY eh2.pct_of_company DESC NULLS LAST,
                   eh2.market_value_cr DESC NULLS LAST,
                   eh2.shares_held DESC NULLS LAST,
                   eh2.id DESC
        ) AS rn
      FROM entity_holdings eh2
      JOIN stocks s2 ON s2.id = eh2.stock_id
    ) ranked
    WHERE eh.id = ranked.id AND ranked.rn > 1
  `);
  return result.rowCount ?? 0;
}

async function dedupeEntityChanges(pool) {
  const result = await pool.query(`
    DELETE FROM entity_changes ec
    WHERE ctid IN (
      SELECT ranked.ctid
      FROM (
        SELECT ec2.ctid,
          ROW_NUMBER() OVER (
            PARTITION BY ec2.entity_id, ec2.strategy_id, ec2.quarter, ${STOCK_KEY.replace(/\bs\./g, 's2.')}
            ORDER BY ABS(COALESCE(ec2.pct_change, 0)) DESC,
                     ec2.stock_id DESC
          ) AS rn
        FROM entity_changes ec2
        JOIN stocks s2 ON s2.id = ec2.stock_id
      ) ranked
      WHERE ranked.rn > 1
    )
  `);
  return result.rowCount ?? 0;
}

async function dedupeEntityConviction(pool) {
  const result = await pool.query(`
    DELETE FROM entity_conviction ecv
    WHERE ctid IN (
      SELECT ranked.ctid
      FROM (
        SELECT ecv2.ctid,
          ROW_NUMBER() OVER (
            PARTITION BY ecv2.entity_id, ecv2.strategy_id, ecv2.quarter, ${STOCK_KEY.replace(/\bs\./g, 's2.')}
            ORDER BY ecv2.conviction DESC NULLS LAST, ecv2.stock_id DESC
          ) AS rn
        FROM entity_conviction ecv2
        JOIN stocks s2 ON s2.id = ecv2.stock_id
      ) ranked
      WHERE ranked.rn > 1
    )
  `);
  return result.rowCount ?? 0;
}

async function dedupeShareholdingPatternHolders(pool) {
  const result = await pool.query(`
    DELETE FROM shareholding_pattern_holders sph
    USING (
      SELECT sph2.id,
        ROW_NUMBER() OVER (
          PARTITION BY sph2.quarter, ${STOCK_KEY.replace(/\bs\./g, 's2.')}, LOWER(TRIM(sph2.holder_name))
          ORDER BY sph2.pct_of_company DESC NULLS LAST,
                   sph2.shares DESC NULLS LAST,
                   sph2.id DESC
        ) AS rn
      FROM shareholding_pattern_holders sph2
      JOIN stocks s2 ON s2.id = sph2.stock_id
    ) ranked
    WHERE sph.id = ranked.id AND ranked.rn > 1
  `);
  return result.rowCount ?? 0;
}

async function dedupeSameStockIdRows(pool) {
  const eh = await pool.query(`
    DELETE FROM entity_holdings eh
    USING entity_holdings eh2
    WHERE eh.strategy_id IS NULL
      AND eh2.strategy_id IS NULL
      AND eh.entity_id = eh2.entity_id
      AND eh.stock_id = eh2.stock_id
      AND eh.quarter = eh2.quarter
      AND eh.id > eh2.id
  `);
  const ec = await pool.query(`
    DELETE FROM entity_changes ec
    USING entity_changes ec2
    WHERE ec.strategy_id IS NULL
      AND ec2.strategy_id IS NULL
      AND ec.entity_id = ec2.entity_id
      AND ec.stock_id = ec2.stock_id
      AND ec.quarter = ec2.quarter
      AND ec.ctid > ec2.ctid
  `);
  return { eh: eh.rowCount ?? 0, ec: ec.rowCount ?? 0 };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Deduplicate Super Investor Data');
  console.log('═══════════════════════════════════════════════════════════\n');

  const pool = getPgPool();
  if (!(await siSchemaPresent(pool))) {
    console.log('  Super-investor schema not present — nothing to do.');
    await closePgPool();
    return;
  }

  const client = await pool.connect();
  let stats = {};
  try {
    await client.query('BEGIN');
    stats.sameStock = await dedupeSameStockIdRows(client);
    stats.holdings = await dedupeEntityHoldings(client);
    stats.changes = await dedupeEntityChanges(client);
    stats.conviction = await dedupeEntityConviction(client);
    stats.sph = await dedupeShareholdingPatternHolders(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await closePgPool();
  }

  console.log(`  entity_holdings (same stock_id):  ${stats.sameStock.eh} removed`);
  console.log(`  entity_changes (same stock_id):   ${stats.sameStock.ec} removed`);
  console.log(`  entity_holdings (canonical key):  ${stats.holdings} removed`);
  console.log(`  entity_changes (canonical key):   ${stats.changes} removed`);
  console.log(`  entity_conviction:                ${stats.conviction} removed`);
  console.log(`  shareholding_pattern_holders:     ${stats.sph} removed`);
  console.log('\n  Next: npm run db:compute-si:all\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
