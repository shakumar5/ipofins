/**
 * Deduplicate stocks by listing identifier tiers:
 *   1. ISIN (when present) — one row per ISIN
 *   2. NSE symbol (when no ISIN) — one row per NSE
 *   3. BSE code (when no ISIN/NSE) — one row per BSE
 * Usage: node scripts/node-with-ca.mjs db/seed/dedupe-stocks-canonical.mjs
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

const HAS_ISIN = `NULLIF(TRIM(s.isin), '') IS NOT NULL`;
const NO_ISIN = `NULLIF(TRIM(s.isin), '') IS NULL`;
const HAS_NSE = `NULLIF(TRIM(s.nse_symbol), '') IS NOT NULL`;
const NO_NSE = `NULLIF(TRIM(s.nse_symbol), '') IS NULL`;
const HAS_BSE = `NULLIF(TRIM(s.bse_code), '') IS NOT NULL`;
const NO_BSE = `NULLIF(TRIM(s.bse_code), '') IS NULL`;

const DEBT_STOCK_FILTER = `
  name ~* '\\d{2}/\\d{2}/\\d{4}'
  OR name ~* '^\\d+\\.?\\d*\\s*%'
  OR id IN (
    SELECT s.id FROM stocks s
    JOIN sectors sec ON sec.id = s.sector_id
    WHERE sec.name ~* '^\\[?(CRISIL|ICRA|FITCH|CARE|BWR|IND|Brickwork)'
  )
`;

/** No listing identifier — unmatchable junk from MF parser / futures rows. */
const UNIDENTIFIED_STOCK_FILTER = `
  NULLIF(TRIM(isin), '') IS NULL
  AND NULLIF(TRIM(nse_symbol), '') IS NULL
  AND NULLIF(TRIM(bse_code), '') IS NULL
`;

/** Derivatives misclassified as equity from MF portfolio disclosures. */
const FUTURES_OPTIONS_STOCK_FILTER = `
  name ~* '\\m(future|futures|option|options|warrant|warrants|fut)\\M'
`;

/** MF scheme/plan labels misclassified as stocks (fund-of-funds rows in AMFI Excel). */
const MF_PLAN_STOCK_FILTER = `
  name ~* '^\\m(regular|direct)\\M\\s+\\mplan\\M'
  OR name ~* '^\\m(growth|dividend)\\M\\s+\\moption\\M'
  OR name ~* '\\m(regular|direct)\\M\\s+\\mplan\\M.*\\m(growth|idcw|dividend|option|payout)\\M'
  OR (name ~* '\\mfund\\M' AND name ~* '\\m(direct|regular)\\M\\s*\\mplan\\M' AND name !~* '\\m(limited|ltd)\\M')
  OR name ~* '-\\s*direct\\s+pl'
  OR name ~* '\\midcw\\M'
  OR name ~* 'dividend\\s*(plan|option|payout)'
  OR id IN (
    SELECT s.id FROM stocks s
    JOIN sectors sec ON sec.id = s.sector_id
    WHERE sec.name ~* '^(Mutual Fund|Foreign Mutual Fund|Overseas Mutual Fund|Exchange Traded Fund|ETF)'
  )
`;

async function purgeStocksMatching(pool, filterSql) {
  const ids = `(SELECT id FROM stocks WHERE ${filterSql})`;
  await pool.query(`UPDATE ipos SET stock_id = NULL WHERE stock_id IN ${ids}`);
  await pool.query(`DELETE FROM stock_signals sig WHERE sig.stock_id IN ${ids}`);
  const holdings = await pool.query(`DELETE FROM fund_holdings fh WHERE fh.stock_id IN ${ids}`);
  await pool.query(`DELETE FROM holdings_changes hc WHERE hc.stock_id IN ${ids}`);

  const siPresent = (await pool.query(`
    SELECT to_regclass('public.shareholding_pattern_holders') IS NOT NULL AS present
  `)).rows[0]?.present;
  if (siPresent) {
    await pool.query(`DELETE FROM shareholding_pattern_holders sph WHERE sph.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM sast_filings sf WHERE sf.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM entity_holdings eh WHERE eh.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM entity_changes ec WHERE ec.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM entity_stock_signals ess WHERE ess.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM entity_conviction ecv WHERE ecv.stock_id IN ${ids}`);
    await pool.query(`DELETE FROM corporate_actions ca WHERE ca.stock_id IN ${ids}`);
  }

  const stocks = await pool.query(`DELETE FROM stocks WHERE ${filterSql}`);
  return { holdings: holdings.rowCount ?? 0, stocks: stocks.rowCount ?? 0 };
}

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
    USING stock_dup_map m, shareholding_pattern_holders sph2, stock_dup_map m2
    WHERE sph.stock_id = m.dup_id
      AND sph2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND sph.holder_name = sph2.holder_name
      AND sph.quarter = sph2.quarter
  `);
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
    USING stock_dup_map m, sast_filings sf2, stock_dup_map m2
    WHERE sf.stock_id = m.dup_id
      AND sf2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND sf.filer_name = sf2.filer_name
      AND sf.filing_date = sf2.filing_date
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
    USING stock_dup_map m, entity_holdings eh2, stock_dup_map m2
    WHERE eh.stock_id = m.dup_id
      AND eh2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND eh.entity_id = eh2.entity_id
      AND eh.strategy_id IS NOT DISTINCT FROM eh2.strategy_id
      AND eh.quarter = eh2.quarter
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
    USING stock_dup_map m, entity_changes ec2, stock_dup_map m2
    WHERE ec.stock_id = m.dup_id
      AND ec2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND ec.entity_id = ec2.entity_id
      AND ec.strategy_id IS NOT DISTINCT FROM ec2.strategy_id
      AND ec.quarter = ec2.quarter
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
    USING stock_dup_map m, entity_stock_signals ess2, stock_dup_map m2
    WHERE ess.stock_id = m.dup_id
      AND ess2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND ess.quarter = ess2.quarter
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
    DELETE FROM entity_conviction ecv
    USING stock_dup_map m, entity_conviction ecv2, stock_dup_map m2
    WHERE ecv.stock_id = m.dup_id
      AND ecv2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND ecv.entity_id = ecv2.entity_id
      AND ecv.strategy_id IS NOT DISTINCT FROM ecv2.strategy_id
      AND ecv.quarter = ecv2.quarter
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
    USING stock_dup_map m, corporate_actions ca2, stock_dup_map m2
    WHERE ca.stock_id = m.dup_id
      AND ca2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND ca.ex_date = ca2.ex_date
      AND ca.action_type = ca2.action_type
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

async function remapStockQuarterTables(client) {
  for (const table of ['stock_quarter_prices', 'stock_shp_summary']) {
    const exists = await client.query(
      `SELECT to_regclass('public.${table}') IS NOT NULL AS present`,
    );
    if (!exists.rows[0]?.present) continue;

    await client.query(`
      DELETE FROM ${table} t
      USING stock_dup_map m, ${table} t2, stock_dup_map m2
      WHERE t.stock_id = m.dup_id
        AND t2.stock_id = m2.dup_id
        AND m.canonical_id = m2.canonical_id
        AND m.dup_id > m2.dup_id
        AND t.quarter = t2.quarter
    `);
    await client.query(`
      DELETE FROM ${table} t
      USING stock_dup_map m, ${table} t2
      WHERE t.stock_id = m.dup_id
        AND t2.stock_id = m.canonical_id
        AND t.quarter = t2.quarter
    `);
    await client.query(`
      UPDATE ${table} t SET stock_id = m.canonical_id
      FROM stock_dup_map m WHERE t.stock_id = m.dup_id
    `);
  }
}

async function applyStockDupMap(client) {
  await client.query(`
    DELETE FROM fund_holdings fh
    USING stock_dup_map m, fund_holdings fh2, stock_dup_map m2
    WHERE fh.stock_id = m.dup_id
      AND fh2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND fh.fund_id = fh2.fund_id
      AND fh.month = fh2.month
  `);
  await client.query(`
    DELETE FROM fund_holdings fh
    USING stock_dup_map m
    WHERE fh.stock_id = m.dup_id
      AND EXISTS (
        SELECT 1 FROM fund_holdings fh2
        WHERE fh2.stock_id = m.canonical_id
          AND fh2.fund_id = fh.fund_id
          AND fh2.month = fh.month
      )
  `);
  await client.query(`
    UPDATE fund_holdings fh SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE fh.stock_id = m.dup_id
  `);
  await client.query(`
    DELETE FROM holdings_changes hc
    USING stock_dup_map m, holdings_changes hc2, stock_dup_map m2
    WHERE hc.stock_id = m.dup_id
      AND hc2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND hc.fund_id = hc2.fund_id
      AND hc.month = hc2.month
  `);
  await client.query(`
    DELETE FROM holdings_changes hc
    USING stock_dup_map m
    WHERE hc.stock_id = m.dup_id
      AND EXISTS (
        SELECT 1 FROM holdings_changes hc2
        WHERE hc2.stock_id = m.canonical_id
          AND hc2.fund_id = hc.fund_id
          AND hc2.month = hc.month
      )
  `);
  await client.query(`
    UPDATE holdings_changes hc SET stock_id = m.canonical_id
    FROM stock_dup_map m WHERE hc.stock_id = m.dup_id
  `);
  await client.query(`
    DELETE FROM stock_signals sig
    USING stock_dup_map m, stock_signals sig2, stock_dup_map m2
    WHERE sig.stock_id = m.dup_id
      AND sig2.stock_id = m2.dup_id
      AND m.canonical_id = m2.canonical_id
      AND m.dup_id > m2.dup_id
      AND sig.month = sig2.month
      AND sig.category = sig2.category
  `);
  await client.query(`
    DELETE FROM stock_signals sig
    USING stock_dup_map m
    WHERE sig.stock_id = m.dup_id
      AND EXISTS (
        SELECT 1 FROM stock_signals sig2
        WHERE sig2.stock_id = m.canonical_id
          AND sig2.month = sig.month
          AND sig2.category = sig.category
      )
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
  await remapStockQuarterTables(client);
  await client.query(`DELETE FROM stocks s USING stock_dup_map m WHERE s.id = m.dup_id`);
}

/** Fold no-ISIN rows into an existing ISIN/NSE row that shares the same NSE or BSE. */
async function mergeOrphansIntoHigherTier(client) {
  await client.query(`
    CREATE TEMP TABLE stock_dup_map ON COMMIT DROP AS
    WITH nse_orphans AS (
      SELECT s.id AS dup_id,
        (SELECT t.id FROM stocks t
         WHERE UPPER(TRIM(t.nse_symbol)) = UPPER(TRIM(s.nse_symbol))
           AND NULLIF(TRIM(t.isin), '') IS NOT NULL
         ORDER BY t.id LIMIT 1) AS canonical_id
      FROM stocks s
      WHERE ${NO_ISIN} AND ${HAS_NSE}
    ),
    bse_orphans AS (
      SELECT s.id AS dup_id,
        (SELECT t.id FROM stocks t
         WHERE NULLIF(TRIM(t.bse_code), '') = NULLIF(TRIM(s.bse_code), '')
           AND (NULLIF(TRIM(t.isin), '') IS NOT NULL OR NULLIF(TRIM(t.nse_symbol), '') IS NOT NULL)
         ORDER BY (NULLIF(TRIM(t.isin), '') IS NOT NULL) DESC, t.id LIMIT 1) AS canonical_id
      FROM stocks s
      WHERE ${NO_ISIN} AND ${NO_NSE} AND ${HAS_BSE}
    ),
    pairs AS (
      SELECT dup_id, canonical_id FROM nse_orphans WHERE canonical_id IS NOT NULL AND dup_id <> canonical_id
      UNION
      SELECT dup_id, canonical_id FROM bse_orphans WHERE canonical_id IS NOT NULL AND dup_id <> canonical_id
    )
    SELECT dup_id, canonical_id FROM pairs
  `);

  const mapResult = await client.query(`SELECT COUNT(*)::int AS c FROM stock_dup_map`);
  const merged = Number(mapResult.rows[0]?.c ?? 0);
  if (merged === 0) return 0;

  await applyStockDupMap(client);
  return merged;
}

/** @param {string} partKeySql SQL expression for partition key (alias `s` = stocks) */
async function mergeDuplicateStocksByPartition(client, partKeySql, whereSql = 'TRUE') {
  const shpSummaryPresent = (
    await client.query(`SELECT to_regclass('public.stock_shp_summary') IS NOT NULL AS present`)
  ).rows[0]?.present;
  const shpHoldersPresent = (
    await client.query(`SELECT to_regclass('public.shareholding_pattern_holders') IS NOT NULL AS present`)
  ).rows[0]?.present;
  const shpSummaryRank = shpSummaryPresent
    ? `(EXISTS (SELECT 1 FROM stock_shp_summary ss WHERE ss.stock_id = n.id)) DESC,`
    : '';
  const shpHoldersRank = shpHoldersPresent
    ? `(EXISTS (SELECT 1 FROM shareholding_pattern_holders sph WHERE sph.stock_id = n.id)) DESC,`
    : '';

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
            ${shpSummaryRank}
            ${shpHoldersRank}
            (NULLIF(TRIM(n.isin), '') IS NOT NULL) DESC,
            (n.sector_id IS NOT NULL) DESC,
            (NULLIF(TRIM(n.nse_symbol), '') IS NOT NULL) DESC,
            (NULLIF(TRIM(n.bse_code), '') IS NOT NULL) DESC,
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

async function mergeDuplicateStocksByBseCode(client) {
  return mergeDuplicateStocksByPartition(
    client,
    `NULLIF(TRIM(s.bse_code), '')`,
    `${NO_ISIN} AND ${NO_NSE} AND ${HAS_BSE}`,
  );
}

async function mergeDuplicateStocksByNseSymbol(client) {
  return mergeDuplicateStocksByPartition(
    client,
    `UPPER(TRIM(s.nse_symbol))`,
    `${NO_ISIN} AND ${HAS_NSE}`,
  );
}

async function mergeDuplicateStocksByIsin(client) {
  return mergeDuplicateStocksByPartition(
    client,
    `UPPER(TRIM(s.isin))`,
    `${HAS_ISIN}`,
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

  const debtPurge = await purgeStocksMatching(pool, DEBT_STOCK_FILTER);
  const unidentifiedPurge = await purgeStocksMatching(pool, UNIDENTIFIED_STOCK_FILTER);
  const derivativesPurge = await purgeStocksMatching(pool, FUTURES_OPTIONS_STOCK_FILTER);
  const mfPlanPurge = await purgeStocksMatching(pool, MF_PLAN_STOCK_FILTER);

  totalMerged += await runMergePass(pool, 'Tier 1 — unique by ISIN', mergeDuplicateStocksByIsin);
  totalMerged += await runMergePass(pool, 'Fold no-ISIN rows into ISIN match (NSE/BSE)', mergeOrphansIntoHigherTier);
  totalMerged += await runMergePass(pool, 'Tier 2 — unique by NSE (no ISIN)', mergeDuplicateStocksByNseSymbol);
  totalMerged += await runMergePass(pool, 'Tier 3 — unique by BSE (no ISIN/NSE)', mergeDuplicateStocksByBseCode);

  const mfPlanLeft = (
    await pool.query(`SELECT COUNT(*)::int AS c FROM stocks WHERE ${MF_PLAN_STOCK_FILTER}`)
  ).rows[0]?.c ?? 0;

  await closePgPool();

  const after = await sql`SELECT COUNT(*)::int AS c FROM stocks`;
  const dupIsin = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT UPPER(TRIM(isin)) FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1
    ) x
  `;

  const dupNse = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT UPPER(TRIM(nse_symbol)) FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NULL
        AND NULLIF(TRIM(nse_symbol), '') IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1
    ) x
  `;

  const dupBse = await sql`
    SELECT COUNT(*)::int AS c FROM (
      SELECT TRIM(bse_code) FROM stocks
      WHERE NULLIF(TRIM(isin), '') IS NULL
        AND NULLIF(TRIM(nse_symbol), '') IS NULL
        AND NULLIF(TRIM(bse_code), '') IS NOT NULL
      GROUP BY 1 HAVING COUNT(*) > 1
    ) x
  `;

  const [unidentifiedLeft] = await sql`
    SELECT COUNT(*)::int AS c FROM stocks
    WHERE NULLIF(TRIM(isin), '') IS NULL
      AND NULLIF(TRIM(nse_symbol), '') IS NULL
      AND NULLIF(TRIM(bse_code), '') IS NULL
  `;

  const [derivativesLeft] = await sql`
    SELECT COUNT(*)::int AS c FROM stocks
    WHERE name ~* '\\m(future|futures|option|options|warrant|warrants|fut)\\M'
  `;

  console.log(`  Duplicate rows merged: ${totalMerged}`);
  console.log(`  Debt holdings removed: ${debtPurge.holdings}`);
  console.log(`  Debt stock rows removed: ${debtPurge.stocks}`);
  console.log(`  Unidentified holdings removed: ${unidentifiedPurge.holdings}`);
  console.log(`  Unidentified stock rows removed: ${unidentifiedPurge.stocks}`);
  console.log(`  Futures/options holdings removed: ${derivativesPurge.holdings}`);
  console.log(`  Futures/options stock rows removed: ${derivativesPurge.stocks}`);
  console.log(`  MF plan holdings removed: ${mfPlanPurge.holdings}`);
  console.log(`  MF plan stock rows removed: ${mfPlanPurge.stocks}`);
  console.log(`  Stocks: ${before[0].c} → ${after[0].c}`);
  console.log(`  Duplicate ISIN groups left: ${dupIsin[0].c}`);
  console.log(`  Duplicate NSE groups left (no ISIN): ${dupNse[0].c}`);
  console.log(`  Duplicate BSE groups left (no ISIN/NSE): ${dupBse[0].c}`);
  console.log(`  Unidentified stocks left (no ISIN/NSE/BSE): ${unidentifiedLeft.c}`);
  console.log(`  Futures/options stocks left: ${derivativesLeft.c}`);
  console.log(`  MF plan stocks left: ${mfPlanLeft}`);
  console.log('\n  Next: npm run db:dedupe-si-data && npm run db:compute-si:all\n');
}

main().catch(async (e) => {
  await closePgPool().catch(() => {});
  console.error('❌', e.message);
  process.exit(1);
});
