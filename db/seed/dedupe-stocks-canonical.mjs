/**
 * Bulk merge duplicate stock rows + cleanup debt misclassified as equity.
 * Usage: node --use-system-ca db/seed/dedupe-stocks-canonical.mjs
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = readFileSync(join(ROOT, '.env'), 'utf-8');
process.env.DATABASE_URL = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(process.env.DATABASE_URL);

/** SQL expression — keep in sync with scripts/lib/stock-utils.mjs normalizeStockName */
const STOCK_NORM = `
  TRIM(BOTH FROM REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          LOWER(TRIM(name)),
          '\\s+\\d{2}/\\d{2}/\\d{4}\\s*$', '', 'g'
        ),
        '\\mlimited\\M', 'ltd', 'gi'
      ),
      '\\mltd\\M', 'ltd', 'gi'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ))
`;

const STOCK_NORM_KEY = `TRIM(BOTH FROM REGEXP_REPLACE(${STOCK_NORM}, '\\s*\\mltd\\M\\s*$', '', 'g'))`;

const DEBT_STOCK_FILTER = `
  name ~* '\\d{2}/\\d{2}/\\d{4}'
  OR name ~* '^\\d+\\.?\\d*\\s*%'
  OR id IN (
    SELECT s.id FROM stocks s
    JOIN sectors sec ON sec.id = s.sector_id
    WHERE sec.name ~* '^\\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)'
  )
`;

async function mergeDuplicateStocks(client) {
  await client.query(`
    CREATE TEMP TABLE stock_dup_map ON COMMIT DROP AS
    WITH normed AS (
      SELECT
        s.id,
        s.isin,
        s.name,
        s.sector_id,
        ${STOCK_NORM_KEY} AS norm_key
      FROM stocks s
    ),
    ranked AS (
      SELECT
        n.id,
        n.norm_key,
        ROW_NUMBER() OVER (
          PARTITION BY n.norm_key
          ORDER BY
            (NULLIF(TRIM(n.isin), '') IS NOT NULL) DESC,
            (n.sector_id IS NOT NULL) DESC,
            CASE WHEN n.name ~ '\\d{2}/\\d{2}/\\d{4}' THEN 1 ELSE 0 END,
            CASE WHEN n.name ~* '\\mlimited\\M' THEN 0 ELSE 1 END,
            n.id ASC
        ) AS rn
      FROM normed n
      WHERE n.norm_key <> ''
    ),
    canonical AS (
      SELECT norm_key, id AS canonical_id FROM ranked WHERE rn = 1
    )
    SELECT r.id AS dup_id, c.canonical_id
    FROM ranked r
    JOIN canonical c ON c.norm_key = r.norm_key
    WHERE r.rn > 1
  `);

  const mapResult = await client.query(`SELECT COUNT(*)::int AS c FROM stock_dup_map`);
  const merged = Number(mapResult.rows[0]?.c ?? 0);
  if (merged === 0) return 0;

  await client.query(`
    DELETE FROM fund_holdings fh
    USING stock_dup_map m, fund_holdings fh2
    WHERE fh.stock_id = m.dup_id
      AND fh2.stock_id = m.canonical_id
      AND fh.fund_id = fh2.fund_id
      AND fh.month = fh2.month
  `);
  await client.query(`
    UPDATE fund_holdings fh SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE fh.stock_id = m.dup_id
  `);
  await client.query(`
    DELETE FROM holdings_changes hc
    USING stock_dup_map m, holdings_changes hc2
    WHERE hc.stock_id = m.dup_id
      AND hc2.stock_id = m.canonical_id
      AND hc.fund_id = hc2.fund_id
      AND hc.month = hc2.month
  `);
  await client.query(`
    UPDATE holdings_changes hc SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE hc.stock_id = m.dup_id
  `);
  await client.query(`DELETE FROM stock_signals sig USING stock_dup_map m WHERE sig.stock_id = m.dup_id`);
  await client.query(`
    UPDATE stocks c SET
      isin = COALESCE(NULLIF(TRIM(c.isin), ''), d.isin),
      sector_id = COALESCE(c.sector_id, d.sector_id),
      updated_at = NOW()
    FROM stock_dup_map m
    JOIN stocks d ON d.id = m.dup_id
    WHERE c.id = m.canonical_id
  `);
  await client.query(`DELETE FROM stocks s USING stock_dup_map m WHERE s.id = m.dup_id`);
  return merged;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Deduplicate Stocks (bulk)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const before = await sql`SELECT COUNT(*)::int AS c FROM stocks`;
  const pool = getPgPool();
  let totalMerged = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    totalMerged += await mergeDuplicateStocks(client);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const backfill = await pool.query(`
    UPDATE stocks s SET isin = src.isin, updated_at = NOW()
    FROM stocks src
    WHERE s.isin IS NULL
      AND src.isin IS NOT NULL
      AND ${STOCK_NORM_KEY.replace(/\bname\b/g, 's.name')} =
          ${STOCK_NORM_KEY.replace(/\bname\b/g, 'src.name')}
  `);

  // Second pass after ISIN backfill (handles any ISIN-only duplicates)
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');
    totalMerged += await mergeDuplicateStocks(client2);
    await client2.query('COMMIT');
  } catch (e) {
    await client2.query('ROLLBACK');
    throw e;
  } finally {
    client2.release();
  }

  const debtIds = `(SELECT id FROM stocks WHERE ${DEBT_STOCK_FILTER})`;
  await pool.query(`DELETE FROM stock_signals sig WHERE sig.stock_id IN ${debtIds}`);
  const debtHoldings = await pool.query(`DELETE FROM fund_holdings fh WHERE fh.stock_id IN ${debtIds}`);
  await pool.query(`DELETE FROM holdings_changes hc WHERE hc.stock_id IN ${debtIds}`);
  const debtStocks = await pool.query(`DELETE FROM stocks WHERE ${DEBT_STOCK_FILTER}`);

  await closePgPool();

  const after = await sql`SELECT COUNT(*)::int AS c FROM stocks`;
  const dupIsin = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT isin FROM stocks WHERE isin IS NOT NULL AND TRIM(isin) <> ''
      GROUP BY isin HAVING COUNT(*) > 1
    ) x
  `;

  console.log(`  Duplicate rows merged: ${totalMerged}`);
  console.log(`  ISIN backfill rows: ${backfill.rowCount}`);
  console.log(`  Debt holdings removed: ${debtHoldings.rowCount}`);
  console.log(`  Debt stock rows removed: ${debtStocks.rowCount}`);
  console.log(`  Stocks: ${before[0].c} → ${after[0].c}`);
  console.log(`  Duplicate ISIN groups left: ${dupIsin[0].c}`);
  console.log('\n  Next: npm run db:compute-signals\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
