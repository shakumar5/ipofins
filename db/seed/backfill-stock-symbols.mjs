#!/usr/bin/env node
/** Backfill nse_symbol / bse_code on stocks rows from ISIN siblings. */
import { getPgPool, closePgPool } from '../../scripts/lib/pg-bulk.mjs';
import { requireDb } from '../../scripts/lib/db-writers.mjs';

async function main() {
  requireDb();
  const pool = getPgPool();

  const result = await pool.query(`
    UPDATE stocks s SET
      nse_symbol = COALESCE(NULLIF(TRIM(s.nse_symbol), ''), src.nse_symbol),
      bse_code = COALESCE(NULLIF(TRIM(s.bse_code), ''), src.bse_code),
      updated_at = NOW()
    FROM (
      SELECT
        isin,
        MAX(NULLIF(TRIM(nse_symbol), '')) AS nse_symbol,
        MAX(NULLIF(TRIM(bse_code), '')) AS bse_code
      FROM stocks
      WHERE isin IS NOT NULL AND TRIM(isin) <> ''
      GROUP BY isin
    ) src
    WHERE s.isin = src.isin
      AND (
        (NULLIF(TRIM(s.nse_symbol), '') IS NULL AND src.nse_symbol IS NOT NULL)
        OR (NULLIF(TRIM(s.bse_code), '') IS NULL AND src.bse_code IS NOT NULL)
      )
  `);

  await closePgPool();
  console.log(`\n  ✅ Stock symbol backfill — ${result.rowCount} rows updated\n`);
}

main().catch(async (err) => {
  await closePgPool().catch(() => {});
  console.error('❌', err.message);
  process.exit(1);
});
