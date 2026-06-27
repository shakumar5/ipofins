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

async function siSchemaPresent(client) {
  const result = await client.query(`
    SELECT to_regclass('public.shareholding_pattern_holders') IS NOT NULL AS present
  `);
  return Boolean(result.rows[0]?.present);
}

/** Remap Super Investor child rows before duplicate stock rows are deleted. */
async function remapSiStockFks(client) {
  if (!(await siSchemaPresent(client))) return;

  await client.query(`
    DELETE FROM shareholding_pattern_holders sph
    USING stock_dup_map m, shareholding_pattern_holders sph2
    WHERE sph.stock_id = m.dup_id
      AND sph2.stock_id = m.canonical_id
      AND sph.holder_name = sph2.holder_name
      AND sph.quarter = sph2.quarter
  `);
  await client.query(`
    UPDATE shareholding_pattern_holders sph SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE sph.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM sast_filings sf
    USING stock_dup_map m, sast_filings sf2
    WHERE sf.stock_id = m.dup_id
      AND sf2.stock_id = m.canonical_id
      AND sf.filer_name = sf2.filer_name
      AND sf.filing_date = sf2.filing_date
  `);
  await client.query(`
    UPDATE sast_filings sf SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE sf.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM entity_holdings eh
    USING stock_dup_map m, entity_holdings eh2
    WHERE eh.stock_id = m.dup_id
      AND eh2.stock_id = m.canonical_id
      AND eh.entity_id = eh2.entity_id
      AND eh.strategy_id IS NOT DISTINCT FROM eh2.strategy_id
      AND eh.quarter = eh2.quarter
  `);
  await client.query(`
    UPDATE entity_holdings eh SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE eh.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM entity_changes ec
    USING stock_dup_map m, entity_changes ec2
    WHERE ec.stock_id = m.dup_id
      AND ec2.stock_id = m.canonical_id
      AND ec.entity_id = ec2.entity_id
      AND ec.strategy_id IS NOT DISTINCT FROM ec2.strategy_id
      AND ec.quarter = ec2.quarter
  `);
  await client.query(`
    UPDATE entity_changes ec SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE ec.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM entity_stock_signals ess
    USING stock_dup_map m, entity_stock_signals ess2
    WHERE ess.stock_id = m.dup_id
      AND ess2.stock_id = m.canonical_id
      AND ess.quarter = ess2.quarter
  `);
  await client.query(`
    UPDATE entity_stock_signals ess SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE ess.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM stock_quarter_prices sqp
    USING stock_dup_map m, stock_quarter_prices sqp2
    WHERE sqp.stock_id = m.dup_id
      AND sqp2.stock_id = m.canonical_id
      AND sqp.quarter = sqp2.quarter
  `);
  await client.query(`
    UPDATE stock_quarter_prices sqp SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE sqp.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM entity_conviction ecv
    USING stock_dup_map m, entity_conviction ecv2
    WHERE ecv.stock_id = m.dup_id
      AND ecv2.stock_id = m.canonical_id
      AND ecv.entity_id = ecv2.entity_id
      AND ecv.strategy_id IS NOT DISTINCT FROM ecv2.strategy_id
      AND ecv.quarter = ecv2.quarter
  `);
  await client.query(`
    UPDATE entity_conviction ecv SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE ecv.stock_id = m.dup_id
  `);

  await client.query(`
    DELETE FROM corporate_actions ca
    USING stock_dup_map m, corporate_actions ca2
    WHERE ca.stock_id = m.dup_id
      AND ca2.stock_id = m.canonical_id
      AND ca.ex_date = ca2.ex_date
      AND ca.action_type = ca2.action_type
  `);
  await client.query(`
    UPDATE corporate_actions ca SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE ca.stock_id = m.dup_id
  `);
}

async function applyStockDupMap(client) {
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
  await client.query(`
    DELETE FROM stock_signals sig
    USING stock_dup_map m, stock_signals sig2
    WHERE sig.stock_id = m.dup_id
      AND sig2.stock_id = m.canonical_id
      AND sig.month = sig2.month
      AND sig.category = sig2.category
  `);
  await client.query(`
    UPDATE stock_signals sig SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE sig.stock_id = m.dup_id
  `);
  await client.query(`
    UPDATE stocks c SET
      isin = COALESCE(NULLIF(TRIM(c.isin), ''), d.isin),
      sector_id = COALESCE(c.sector_id, d.sector_id),
      nse_symbol = COALESCE(NULLIF(TRIM(c.nse_symbol), ''), d.nse_symbol),
      bse_code = COALESCE(NULLIF(TRIM(c.bse_code), ''), d.bse_code),
      updated_at = NOW()
    FROM stock_dup_map m
    JOIN stocks d ON d.id = m.dup_id
    WHERE c.id = m.canonical_id
  `);
  await remapSiStockFks(client);
  await client.query(`DELETE FROM stocks s USING stock_dup_map m WHERE s.id = m.dup_id`);
}

/** @param {string} partKeySql SQL expression for partition key (alias `s` = stocks) */
async function mergeDuplicateStocksByPartition(client, partKeySql, whereSql = 'TRUE') {
  await client.query(`
    CREATE TEMP TABLE stock_dup_map ON COMMIT DROP AS
    WITH normed AS (
      SELECT
        s.id,
        s.isin,
        s.name,
        s.sector_id,
        s.nse_symbol,
        s.bse_code,
        ${partKeySql} AS part_key
      FROM stocks s
      WHERE ${whereSql}
    ),
    ranked AS (
      SELECT
        n.id,
        n.part_key,
        ROW_NUMBER() OVER (
          PARTITION BY n.part_key
          ORDER BY
            (NULLIF(TRIM(n.isin), '') IS NOT NULL) DESC,
            (n.sector_id IS NOT NULL) DESC,
            (NULLIF(TRIM(n.nse_symbol), '') IS NOT NULL) DESC,
            CASE WHEN n.name ~ '\\d{2}/\\d{2}/\\d{4}' THEN 1 ELSE 0 END,
            CASE WHEN n.name ~* '\\mlimited\\M' THEN 0 ELSE 1 END,
            LENGTH(n.name) ASC,
            n.id ASC
        ) AS rn
      FROM normed n
      WHERE n.part_key IS NOT NULL AND n.part_key <> ''
    ),
    canonical AS (
      SELECT part_key, id AS canonical_id FROM ranked WHERE rn = 1
    )
    SELECT r.id AS dup_id, c.canonical_id
    FROM ranked r
    JOIN canonical c ON c.part_key = r.part_key
    WHERE r.rn > 1
  `);

  const mapResult = await client.query(`SELECT COUNT(*)::int AS c FROM stock_dup_map`);
  const merged = Number(mapResult.rows[0]?.c ?? 0);
  if (merged === 0) return 0;

  await applyStockDupMap(client);
  return merged;
}

async function mergeDuplicateStocks(client) {
  return mergeDuplicateStocksByPartition(client, STOCK_NORM_KEY, `${STOCK_NORM_KEY} <> ''`);
}

async function mergeDuplicateStocksByNseSymbol(client) {
  return mergeDuplicateStocksByPartition(
    client,
    `UPPER(TRIM(s.nse_symbol))`,
    `NULLIF(TRIM(s.nse_symbol), '') IS NOT NULL`,
  );
}

async function mergeDuplicateStocksByIsin(client) {
  return mergeDuplicateStocksByPartition(
    client,
    `UPPER(TRIM(s.isin))`,
    `NULLIF(TRIM(s.isin), '') IS NOT NULL`,
  );
}

async function runMergePass(pool, label, mergeFn) {
  const client = await pool.connect();
  let merged = 0;
  try {
    await client.query('BEGIN');
    merged = await mergeFn(client);
    await client.query('COMMIT');
    if (merged > 0) console.log(`  ${label}: merged ${merged} duplicate stock rows`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return merged;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Finverse — Deduplicate Stocks (bulk)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const before = await sql`SELECT COUNT(*)::int AS c FROM stocks`;
  const pool = getPgPool();
  let totalMerged = 0;

  totalMerged += await runMergePass(pool, 'By normalized name', mergeDuplicateStocks);
  totalMerged += await runMergePass(pool, 'By NSE symbol', mergeDuplicateStocksByNseSymbol);
  totalMerged += await runMergePass(pool, 'By ISIN', mergeDuplicateStocksByIsin);

  const backfill = await pool.query(`
    UPDATE stocks s SET isin = src.isin, updated_at = NOW()
    FROM stocks src
    WHERE s.isin IS NULL
      AND src.isin IS NOT NULL
      AND ${STOCK_NORM_KEY.replace(/\bname\b/g, 's.name')} =
          ${STOCK_NORM_KEY.replace(/\bname\b/g, 'src.name')}
  `);

  // Second pass after ISIN backfill (handles any residual duplicates)
  totalMerged += await runMergePass(pool, 'By normalized name (pass 2)', mergeDuplicateStocks);
  totalMerged += await runMergePass(pool, 'By NSE symbol (pass 2)', mergeDuplicateStocksByNseSymbol);
  totalMerged += await runMergePass(pool, 'By ISIN (pass 2)', mergeDuplicateStocksByIsin);

  const debtIds = `(SELECT id FROM stocks WHERE ${DEBT_STOCK_FILTER})`;
  await pool.query(`DELETE FROM stock_signals sig WHERE sig.stock_id IN ${debtIds}`);
  const debtHoldings = await pool.query(`DELETE FROM fund_holdings fh WHERE fh.stock_id IN ${debtIds}`);
  await pool.query(`DELETE FROM holdings_changes hc WHERE hc.stock_id IN ${debtIds}`);

  const siPresent = (await pool.query(`
    SELECT to_regclass('public.shareholding_pattern_holders') IS NOT NULL AS present
  `)).rows[0]?.present;
  if (siPresent) {
    await pool.query(`DELETE FROM shareholding_pattern_holders sph WHERE sph.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM sast_filings sf WHERE sf.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM entity_holdings eh WHERE eh.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM entity_changes ec WHERE ec.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM entity_stock_signals ess WHERE ess.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM entity_conviction ecv WHERE ecv.stock_id IN ${debtIds}`);
    await pool.query(`DELETE FROM corporate_actions ca WHERE ca.stock_id IN ${debtIds}`);
  }

  const debtStocks = await pool.query(`DELETE FROM stocks WHERE ${DEBT_STOCK_FILTER}`);

  await closePgPool();

  const after = await sql`SELECT COUNT(*)::int AS c FROM stocks`;
  const dupIsin = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT isin FROM stocks WHERE isin IS NOT NULL AND TRIM(isin) <> ''
      GROUP BY isin HAVING COUNT(*) > 1
    ) x
  `;

  const dupNse = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT UPPER(TRIM(nse_symbol)) FROM stocks
      WHERE NULLIF(TRIM(nse_symbol), '') IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1
    ) x
  `;

  console.log(`  Duplicate rows merged: ${totalMerged}`);
  console.log(`  ISIN backfill rows: ${backfill.rowCount}`);
  console.log(`  Debt holdings removed: ${debtHoldings.rowCount}`);
  console.log(`  Debt stock rows removed: ${debtStocks.rowCount}`);
  console.log(`  Stocks: ${before[0].c} → ${after[0].c}`);
  console.log(`  Duplicate ISIN groups left: ${dupIsin[0].c}`);
  console.log(`  Duplicate NSE symbol groups left: ${dupNse[0].c}`);
  console.log('\n  Next: npm run db:dedupe-si-data && npm run db:compute-si:all\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
